public with sharing class SamplesShipmentController {

    public class LineItem {
        @AuraEnabled public Id product2Id;
        @AuraEnabled public Id productionBatchId;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public String productName;
        @AuraEnabled public String batchName;
    }

    public class LocationOption {
        @AuraEnabled public Id locationId;
        @AuraEnabled public String name;
        @AuraEnabled public String userName;
        @AuraEnabled public String territory;

        public LocationOption(Schema.Location loc, String uName, String terr) {
            this.locationId = loc.Id;
            this.name = loc.Name;
            this.userName = uName;
            this.territory = terr;
        }
    }

    public class BatchInfo {
        @AuraEnabled public Id batchItemId;
        @AuraEnabled public Id productionBatchId;
        @AuraEnabled public String batchName;
        @AuraEnabled public DateTime expirationDate;
        @AuraEnabled public Decimal remainingQuantity;
    }

    public class ProductInventory {
        @AuraEnabled public Id productItemId;
        @AuraEnabled public Id product2Id;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal quantityOnHand;
        @AuraEnabled public List<BatchInfo> batches;
    }

    @AuraEnabled(cacheable=true)
    public static List<LocationOption> getWarehouses() {
        List<LocationOption> results = new List<LocationOption>();
        for (Schema.Location loc : [
            SELECT Id, Name
            FROM Location
            WHERE LocationType = 'Warehouse'
              AND IsInventoryLocation = true
            ORDER BY Name
        ]) {
            results.add(new LocationOption(loc, null, null));
        }
        return results;
    }

    @AuraEnabled(cacheable=true)
    public static List<LocationOption> getReps() {
        List<Schema.Location> locations = [
            SELECT Id, Name, PrimaryUserId
            FROM Location
            WHERE LocationType = 'User Inventory'
              AND IsInventoryLocation = true
              AND PrimaryUserId != null
            ORDER BY Name
        ];

        Set<Id> userIds = new Set<Id>();
        for (Schema.Location loc : locations) {
            userIds.add(loc.PrimaryUserId);
        }

        Map<Id, User> userMap = new Map<Id, User>([
            SELECT Id, Name FROM User WHERE Id IN :userIds
        ]);

        Map<Id, String> territoryMap = new Map<Id, String>();
        for (UserTerritory2Association uta : [
            SELECT UserId, Territory2.Name
            FROM UserTerritory2Association
            WHERE UserId IN :userIds AND IsActive = true
            ORDER BY Territory2.Name
        ]) {
            if (!territoryMap.containsKey(uta.UserId)) {
                territoryMap.put(uta.UserId, uta.Territory2.Name);
            }
        }

        List<LocationOption> results = new List<LocationOption>();
        for (Schema.Location loc : locations) {
            User u = userMap.get(loc.PrimaryUserId);
            String uName = u != null ? u.Name : loc.Name;
            String terr = territoryMap.containsKey(loc.PrimaryUserId)
                ? territoryMap.get(loc.PrimaryUserId) : '';
            results.add(new LocationOption(loc, uName, terr));
        }
        return results;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProductInventory> getWarehouseInventory(Id warehouseLocationId) {
        List<ProductItem> items = [
            SELECT Id, Product2Id, Product2.Name, QuantityOnHand
            FROM ProductItem
            WHERE LocationId = :warehouseLocationId
              AND QuantityOnHand > 0
            ORDER BY Product2.Name
        ];

        Set<Id> productItemIds = new Set<Id>();
        for (ProductItem pi : items) {
            productItemIds.add(pi.Id);
        }

        List<ProductBatchItem> batchItems = [
            SELECT Id, ProductionBatchId, ProductionBatch.Name,
                   ProductionBatch.ExpirationDate, RemainingQuantity,
                   ProductItemId
            FROM ProductBatchItem
            WHERE ProductItemId IN :productItemIds
              AND RemainingQuantity > 0
              AND ProductionBatch.IsActive = true
            ORDER BY ProductionBatch.Name
        ];

        Map<Id, List<BatchInfo>> batchMap = new Map<Id, List<BatchInfo>>();
        for (ProductBatchItem pbi : batchItems) {
            BatchInfo bi = new BatchInfo();
            bi.batchItemId = pbi.Id;
            bi.productionBatchId = pbi.ProductionBatchId;
            bi.batchName = pbi.ProductionBatch.Name;
            bi.expirationDate = pbi.ProductionBatch.ExpirationDate;
            bi.remainingQuantity = pbi.RemainingQuantity;

            if (!batchMap.containsKey(pbi.ProductItemId)) {
                batchMap.put(pbi.ProductItemId, new List<BatchInfo>());
            }
            batchMap.get(pbi.ProductItemId).add(bi);
        }

        List<ProductInventory> results = new List<ProductInventory>();
        for (ProductItem pi : items) {
            ProductInventory inv = new ProductInventory();
            inv.productItemId = pi.Id;
            inv.product2Id = pi.Product2Id;
            inv.productName = pi.Product2.Name;
            inv.quantityOnHand = pi.QuantityOnHand;
            inv.batches = batchMap.containsKey(pi.Id)
                ? batchMap.get(pi.Id)
                : new List<BatchInfo>();
            results.add(inv);
        }
        return results;
    }

    @AuraEnabled
    public static Id createShipment(Id warehouseLocationId, Id repLocationId, String lineItemsJson) {
        List<LineItem> lineItems = (List<LineItem>) JSON.deserialize(lineItemsJson, List<LineItem>.class);

        if (lineItems == null || lineItems.isEmpty()) {
            throw new AuraHandledException('No line items provided.');
        }

        for (LineItem li : lineItems) {
            if (li.quantity == null || li.quantity <= 0) {
                throw new AuraHandledException(
                    'Quantity must be greater than 0 for ' + li.productName + ' / ' + li.batchName
                );
            }
        }

        try {
            Schema.Location repLocation = [
                SELECT Id, Name, PrimaryUserId
                FROM Location
                WHERE Id = :repLocationId
                LIMIT 1
            ];

            String shipToName = repLocation.Name;
            if (repLocation.PrimaryUserId != null) {
                List<User> users = [SELECT Name FROM User WHERE Id = :repLocation.PrimaryUserId LIMIT 1];
                if (!users.isEmpty()) {
                    shipToName = users[0].Name;
                }
            }

            List<Schema.Address> addresses = [
                SELECT Id FROM Address
                WHERE ParentId = :repLocationId
                LIMIT 1
            ];
            Id addressId = addresses.isEmpty() ? null : addresses[0].Id;

            InventoryOperation invOp = new InventoryOperation();
            invOp.OperationType = 'TransferIn';
            invOp.SourceLocationId = warehouseLocationId;
            invOp.DestinationLocationId = repLocationId;
            invOp.DestinationAddressId = addressId;
            invOp.ShipmentStatus = 'Shipped';
            invOp.Status = 'Completed';
            invOp.OwnerId = repLocation.PrimaryUserId;
            insert invOp;

            Shipment shipmentRecord = new Shipment();
            shipmentRecord.ShipToName = shipToName;
            insert shipmentRecord;

            Map<Id, Decimal> productQuantities = new Map<Id, Decimal>();
            for (LineItem li : lineItems) {
                Decimal existing = productQuantities.containsKey(li.product2Id)
                    ? productQuantities.get(li.product2Id)
                    : 0;
                productQuantities.put(li.product2Id, existing + li.quantity);
            }

            List<ShipmentItem> shipmentItems = new List<ShipmentItem>();
            for (Id productId : productQuantities.keySet()) {
                ShipmentItem si = new ShipmentItem();
                si.ShipmentId = shipmentRecord.Id;
                si.Product2Id = productId;
                si.Quantity = productQuantities.get(productId);
                shipmentItems.add(si);
            }
            insert shipmentItems;

            List<ProductTransfer> transfers = new List<ProductTransfer>();
            for (LineItem li : lineItems) {
                ProductTransfer pt = new ProductTransfer();
                pt.InventoryOperationId = invOp.Id;
                pt.ShipmentId = shipmentRecord.Id;
                pt.DestinationLocationId = repLocationId;
                pt.Product2Id = li.product2Id;
                pt.ProductionBatchId = li.productionBatchId;
                pt.QuantitySent = li.quantity;
                pt.QuantityReceived = li.quantity;
                pt.QuantityUnitOfMeasure = 'Each';
                pt.IsReceived = true;
                transfers.add(pt);
            }
            insert transfers;

            return invOp.Id;

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
