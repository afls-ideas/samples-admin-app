# Samples Shipment Creator

A Lightning Web Component app for pharma samples administrators to send sample shipments from a warehouse to field reps in Life Sciences Cloud.

## What It Does

The admin selects a source warehouse and a destination rep, picks sample products with specific production batches and quantities, and submits a shipment. The app creates the full record chain required for the shipment to appear in the rep's **Inventory Operations Timeline** and **Received Inventory Acknowledgements** panel on the Sample Inventory Management page.

### Records Created Per Shipment

| Object | Records | Purpose |
|--------|---------|---------|
| `InventoryOperation` | 1 | Drives the UI — appears in the rep's Inventory Operations Timeline |
| `Shipment` | 1 | Groups the transfers and provides shipping details |
| `ShipmentItem` | 1 per product | Line items on the shipment |
| `ProductTransfer` | 1 per batch | Actual inventory movement — triggers `ProductItem.QuantityOnHand` increment |

```
InventoryOperation (TransferIn, Completed, OwnerId = rep)
    └─ ProductTransfer (one per batch, linked to Shipment)
           └─ QuantityOnHand auto-incremented on rep's ProductItem

Shipment (ShipToName = rep)
    └─ ShipmentItem (one per product, aggregated quantity)
```

### Key Implementation Details

- **`InventoryOperation.OwnerId`** must be set to the rep's User Id — the timeline filters by ownership
- **`InventoryOperation.ShipmentStatus`** must be `'Shipped'` — null values don't appear in the timeline
- **`ProductTransfer.SourceLocationId`** must NOT be set — when linked to a TransferIn InventoryOperation, the source is defined on the operation. Setting both causes a platform error
- **`ProductTransfer.QuantityUnitOfMeasure`** must match the destination ProductItem (typically `'Each'`)
- **`Schema.Location`** and **`Schema.Address`** must be used in Apex instead of `Location`/`Address` to avoid conflicts with `System.Location`/`System.Address`
- **API version 66.0** is required — `InventoryOperation`, `ProductBatchItem`, and related objects are not recognized by the Apex compiler at lower versions

## Project Structure

```
force-app/main/default/
├── classes/
│   ├── SamplesShipmentController.cls          # Apex controller (4 @AuraEnabled methods)
│   └── SamplesShipmentController.cls-meta.xml
├── lwc/samplesShipmentCreator/
│   ├── samplesShipmentCreator.html            # 3-step wizard UI
│   ├── samplesShipmentCreator.js              # LWC controller
│   ├── samplesShipmentCreator.js-meta.xml
│   └── samplesShipmentCreator.css
├── aura/SamplesShipmentCreatorApp/
│   ├── SamplesShipmentCreatorApp.cmp          # Aura wrapper for custom tab
│   └── SamplesShipmentCreatorApp.cmp-meta.xml
├── flexipages/
│   └── Samples_Shipment_Creator.flexipage-meta.xml
├── tabs/
│   └── Samples_Shipment_Creator.tab-meta.xml
└── permissionsets/
    └── Samples_Shipment_Admin.permissionset-meta.xml
```

## Apex Controller Methods

| Method | Description |
|--------|-------------|
| `getWarehouses()` | Returns warehouse Locations (`LocationType = 'Warehouse'`) |
| `getReps()` | Returns rep inventory Locations with user names |
| `getWarehouseInventory(warehouseLocationId)` | Returns ProductItems with active ProductBatchItems at the warehouse |
| `createShipment(warehouseLocationId, repLocationId, lineItemsJson)` | Creates the full InventoryOperation/Shipment/ShipmentItem/ProductTransfer chain in a single transaction |

## User Workflow

1. **Select** — Choose a source warehouse and destination rep from dropdowns
2. **Pick** — Browse warehouse inventory grouped by product, enter quantities per batch/lot
3. **Review** — Confirm the shipment summary (source, destination, products, batches, quantities)
4. **Submit** — Creates all records; rep's `ProductItem.QuantityOnHand` is auto-incremented

## Prerequisites

- **Life Sciences Cloud** with Sample Management enabled
- At least one **warehouse Location** (`LocationType = 'Warehouse'`, `IsInventoryLocation = true`) with ProductItem and ProductBatchItem records
- **Rep inventory Locations** (`LocationType = 'User Inventory'`) with `PrimaryUserId` set
- The warehouse must have `ProductionBatch` records linked to `ProductBatchItem` records

## Deployment

```bash
sf project deploy start --manifest manifest/package.xml --target-org {your_org}
```

After deploying:

1. Assign the **Samples Shipment Admin** permission set to admin users:
   ```bash
   sf org assign permset --name Samples_Shipment_Admin --target-org {your_org}
   ```

2. Add the **Samples Shipment Creator** tab to a Lightning app (e.g., Life Sciences Commercial) via App Builder

3. Access the app from the App Launcher by searching "Samples Shipment Creator"

## Future: Manager-to-Rep Transfers

The architecture supports a future expansion where managers can transfer inventory between reps on their team. The same `createShipment` flow applies — the source would be a rep's Location instead of a warehouse.
