public with sharing class SourceLocationController {

    public class PicklistOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }

    public class LocationTypeOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }

    public class ProductOption {
        @AuraEnabled public Id productId;
        @AuraEnabled public String name;
        @AuraEnabled public String productCode;
    }

    public class BatchOption {
        @AuraEnabled public Id batchId;
        @AuraEnabled public Id productId;
        @AuraEnabled public String name;
        @AuraEnabled public DateTime expirationDate;
    }

    public class InventoryLineItem {
        @AuraEnabled public Id product2Id;
        @AuraEnabled public Id productionBatchId;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public String productName;
        @AuraEnabled public String batchName;
    }

    public class InventoryResult {
        @AuraEnabled public Integer productItemsCreated;
        @AuraEnabled public Integer batchItemsCreated;
    }

    @AuraEnabled(cacheable=true)
    public static List<LocationTypeOption> getLocationTypes() {
        List<LocationTypeOption> options = new List<LocationTypeOption>();
        for (Schema.PicklistEntry pe : Schema.Location.LocationType.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                LocationTypeOption opt = new LocationTypeOption();
                opt.label = pe.getLabel();
                opt.value = pe.getValue();
                options.add(opt);
            }
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<PicklistOption> getCountryOptions() {
        List<PicklistOption> options = new List<PicklistOption>();
        for (Schema.PicklistEntry pe : Schema.Address.CountryCode.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                PicklistOption opt = new PicklistOption();
                opt.label = pe.getLabel();
                opt.value = pe.getValue();
                options.add(opt);
            }
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<PicklistOption> getStateOptions(String countryCode) {
        List<PicklistOption> options = new List<PicklistOption>();
        for (Schema.PicklistEntry pe : Schema.Address.StateCode.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                PicklistOption opt = new PicklistOption();
                opt.label = pe.getLabel();
                opt.value = pe.getValue();
                options.add(opt);
            }
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProductOption> getSampleProducts() {
        List<ProductOption> results = new List<ProductOption>();
        for (Product2 p : [
            SELECT Id, Name, ProductCode
            FROM Product2
            WHERE IsActive = true
            ORDER BY Name
        ]) {
            ProductOption opt = new ProductOption();
            opt.productId = p.Id;
            opt.name = p.Name;
            opt.productCode = p.ProductCode;
            results.add(opt);
        }
        return results;
    }

    @AuraEnabled(cacheable=true)
    public static List<BatchOption> getProductionBatches() {
        List<BatchOption> results = new List<BatchOption>();
        for (ProductionBatch pb : [
            SELECT Id, Name, ExpirationDate, ProductId
            FROM ProductionBatch
            WHERE IsActive = true
            ORDER BY Name
        ]) {
            BatchOption opt = new BatchOption();
            opt.batchId = pb.Id;
            opt.productId = pb.ProductId;
            opt.name = pb.Name;
            opt.expirationDate = pb.ExpirationDate;
            results.add(opt);
        }
        return results;
    }

    public class LocationOption {
        @AuraEnabled public Id locationId;
        @AuraEnabled public String name;
        @AuraEnabled public String locationType;
    }

    public class ExistingInventory {
        @AuraEnabled public Id productItemId;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal quantityOnHand;
        @AuraEnabled public List<ExistingBatch> batches;
    }

    public class ExistingBatch {
        @AuraEnabled public Id batchItemId;
        @AuraEnabled public String batchName;
        @AuraEnabled public DateTime expirationDate;
        @AuraEnabled public Decimal remainingQuantity;
    }

    @AuraEnabled(cacheable=true)
    public static List<LocationOption> getInventoryLocations() {
        List<LocationOption> results = new List<LocationOption>();
        for (Schema.Location loc : [
            SELECT Id, Name, LocationType
            FROM Location
            WHERE IsInventoryLocation = true
            ORDER BY LocationType, Name
        ]) {
            LocationOption opt = new LocationOption();
            opt.locationId = loc.Id;
            opt.name = loc.Name;
            opt.locationType = loc.LocationType;
            results.add(opt);
        }
        return results;
    }

    @AuraEnabled
    public static List<ExistingInventory> getLocationInventory(Id locationId) {
        List<ProductItem> items = [
            SELECT Id, Product2Id, Product2.Name, QuantityOnHand
            FROM ProductItem
            WHERE LocationId = :locationId
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
              AND ProductionBatch.IsActive = true
            ORDER BY ProductionBatch.Name
        ];

        Map<Id, List<ExistingBatch>> batchMap = new Map<Id, List<ExistingBatch>>();
        for (ProductBatchItem pbi : batchItems) {
            ExistingBatch eb = new ExistingBatch();
            eb.batchItemId = pbi.Id;
            eb.batchName = pbi.ProductionBatch.Name;
            eb.expirationDate = pbi.ProductionBatch.ExpirationDate;
            eb.remainingQuantity = pbi.RemainingQuantity;
            if (!batchMap.containsKey(pbi.ProductItemId)) {
                batchMap.put(pbi.ProductItemId, new List<ExistingBatch>());
            }
            batchMap.get(pbi.ProductItemId).add(eb);
        }

        List<ExistingInventory> results = new List<ExistingInventory>();
        for (ProductItem pi : items) {
            ExistingInventory inv = new ExistingInventory();
            inv.productItemId = pi.Id;
            inv.productName = pi.Product2.Name;
            inv.quantityOnHand = pi.QuantityOnHand;
            inv.batches = batchMap.containsKey(pi.Id)
                ? batchMap.get(pi.Id)
                : new List<ExistingBatch>();
            results.add(inv);
        }
        return results;
    }

    @AuraEnabled
    public static Id createSourceLocation(
        String name,
        String locationType,
        Boolean isInventoryLocation,
        String street,
        String city,
        String stateCode,
        String postalCode,
        String countryCode
    ) {
        Schema.Location loc = new Schema.Location();
        loc.Name = name;
        loc.LocationType = locationType;
        loc.IsInventoryLocation = isInventoryLocation;
        insert loc;

        Schema.Address addr = new Schema.Address();
        addr.ParentId = loc.Id;
        addr.Street = street;
        addr.City = city;
        addr.StateCode = stateCode;
        addr.PostalCode = postalCode;
        addr.CountryCode = countryCode;
        addr.AddressType = 'Mailing';
        insert addr;

        return loc.Id;
    }

    @AuraEnabled
    public static InventoryResult addInventoryToLocation(Id locationId, String lineItemsJson) {
        List<InventoryLineItem> lineItems = (List<InventoryLineItem>) JSON.deserialize(
            lineItemsJson, List<InventoryLineItem>.class
        );

        if (lineItems == null || lineItems.isEmpty()) {
            throw new AuraHandledException('No inventory items provided.');
        }

        try {
            Map<Id, ProductItem> existingItems = new Map<Id, ProductItem>();
            for (ProductItem pi : [
                SELECT Id, Product2Id, QuantityOnHand
                FROM ProductItem
                WHERE LocationId = :locationId
            ]) {
                existingItems.put(pi.Product2Id, pi);
            }

            Map<Id, ProductItem> newProductItems = new Map<Id, ProductItem>();
            List<ProductItem> toUpdate = new List<ProductItem>();

            for (InventoryLineItem li : lineItems) {
                if (existingItems.containsKey(li.product2Id)) {
                    ProductItem pi = existingItems.get(li.product2Id);
                    pi.QuantityOnHand += li.quantity;
                    toUpdate.add(pi);
                } else if (!newProductItems.containsKey(li.product2Id)) {
                    ProductItem pi = new ProductItem();
                    pi.LocationId = locationId;
                    pi.Product2Id = li.product2Id;
                    pi.QuantityOnHand = 0;
                    pi.QuantityUnitOfMeasure = 'Each';
                    newProductItems.put(li.product2Id, pi);
                }
                if (newProductItems.containsKey(li.product2Id)) {
                    newProductItems.get(li.product2Id).QuantityOnHand += li.quantity;
                }
            }

            if (!newProductItems.isEmpty()) {
                insert newProductItems.values();
            }
            if (!toUpdate.isEmpty()) {
                update toUpdate;
            }

            Map<Id, ProductItem> allItems = new Map<Id, ProductItem>();
            allItems.putAll(existingItems);
            for (Id prodId : newProductItems.keySet()) {
                allItems.put(prodId, newProductItems.get(prodId));
            }

            List<ProductBatchItem> batchItemsToInsert = new List<ProductBatchItem>();
            for (InventoryLineItem li : lineItems) {
                ProductItem pi = allItems.get(li.product2Id);
                ProductBatchItem pbi = new ProductBatchItem();
                pbi.ProductItemId = pi.Id;
                pbi.ProductionBatchId = li.productionBatchId;
                pbi.RemainingQuantity = li.quantity;
                pbi.IsActive = true;
                batchItemsToInsert.add(pbi);
            }

            insert batchItemsToInsert;

            InventoryResult result = new InventoryResult();
            result.productItemsCreated = newProductItems.size();
            result.batchItemsCreated = batchItemsToInsert.size();
            return result;

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
