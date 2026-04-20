# Samples Admin App - Feature Flows

This document describes the user flows for each feature in the Samples Admin App, including which Salesforce objects are written to at each step.

---

## Home Navigation

```mermaid
flowchart TD
    HOME[Samples Administration Home]
    HOME --> SHIP[Send Shipment]
    HOME --> INV[Manage Inventory]
    HOME --> SRC[Create Source Location]
    HOME --> USR[Create User Inventory Locations]
```

---

## 1. Send Shipment

Ship samples from a warehouse to a rep's inventory location.

```mermaid
flowchart TD
    subgraph Step1[Step 1: Select Source & Destination]
        S1A[Select source warehouse]
        S1B[Search destination rep by name/territory]
        S1A --> S1C[Preview warehouse inventory]
    end

    subgraph Step2[Step 2: Select Products]
        S2A[View products with batch/lot details]
        S2B[Enter quantity per batch]
    end

    subgraph Step3[Step 3: Review & Submit]
        S3A[Review from/to/line items]
        S3B[Submit shipment]
    end

    Step1 --> Step2 --> Step3

    S3B --> W1[/"INSERT InventoryOperation
    (TransferIn, source → destination)"/]
    W1 --> W2[/"INSERT Shipment
    (ShipToName = rep name)"/]
    W2 --> W3[/"INSERT ShipmentItem[]
    (one per product, aggregated qty)"/]
    W3 --> W4[/"INSERT ProductTransfer[]
    (one per batch line item)"/]

    style W1 fill:#d4edda
    style W2 fill:#d4edda
    style W3 fill:#d4edda
    style W4 fill:#d4edda
```

### Objects Written

| Object | Operation | Description |
|--------|-----------|-------------|
| `InventoryOperation` | INSERT | Transfer record linking source warehouse to destination rep location |
| `Shipment` | INSERT | Shipment header with `ShipToName` |
| `ShipmentItem` | INSERT | One per product (quantities aggregated across batches) |
| `ProductTransfer` | INSERT | One per batch line item with `QuantitySent`, `ProductionBatchId` |

---

## 2. Manage Inventory

View and add inventory (products + batches) at any inventory location.

```mermaid
flowchart TD
    subgraph View[View Existing Inventory]
        V1[Select location from dropdown]
        V2[Display current ProductItems and batches]
        V1 --> V2
    end

    subgraph Add[Add Inventory Lines]
        A1[Select product]
        A2[Select production batch filtered by product]
        A3[Enter quantity]
        A1 --> A2 --> A3
    end

    View --> Add

    A3 --> SAVE[Save Inventory]

    SAVE --> CHECK{ProductItem exists for product at location?}

    CHECK -->|No| W1[/"INSERT ProductItem
    (LocationId, Product2Id, QuantityOnHand)"/]
    CHECK -->|Yes| W2[/"UPDATE ProductItem
    (add quantity to QuantityOnHand)"/]

    W1 --> W3[/"INSERT ProductBatchItem
    (ProductItemId, ProductionBatchId, RemainingQuantity)"/]
    W2 --> W3

    style W1 fill:#d4edda
    style W2 fill:#fff3cd
    style W3 fill:#d4edda
```

### Objects Written

| Object | Operation | Description |
|--------|-----------|-------------|
| `ProductItem` | INSERT or UPDATE | Creates new product inventory record at location, or updates `QuantityOnHand` if one already exists |
| `ProductBatchItem` | INSERT | Links a `ProductionBatch` to the `ProductItem` with `RemainingQuantity` |

---

## 3. Create Source Location

Create a warehouse, site, or office location for storing samples inventory.

```mermaid
flowchart TD
    subgraph Form[Location Details]
        F1[Enter name]
        F2[Select location type - Warehouse/Site/Office]
        F3[Check 'Is Inventory Location']
        F4[Enter address - street, city, state, postal, country]
    end

    Form --> SUBMIT[Create Location]

    SUBMIT --> W1[/"INSERT Location
    (Name, LocationType, IsInventoryLocation)"/]
    W1 --> W2[/"INSERT Address
    (ParentId = Location.Id, Street, City, StateCode, PostalCode, CountryCode)"/]

    W2 --> SUCCESS[Success - option to Add Inventory]
    SUCCESS -->|Add Inventory| INV[Navigate to Manage Inventory with locationId]

    style W1 fill:#d4edda
    style W2 fill:#d4edda
```

### Objects Written

| Object | Operation | Description |
|--------|-----------|-------------|
| `Location` | INSERT | The warehouse/site/office record with `LocationType` and `IsInventoryLocation = true` |
| `Address` | INSERT | Physical address linked to the location via `ParentId` |

---

## 4. Create User Inventory Locations

Mass-create inventory locations for multiple reps at a shared address.

```mermaid
flowchart TD
    subgraph Step1[Step 1: Select Users]
        S1A[Load active users without existing inventory location]
        S1B[Select one or more users from list]
    end

    subgraph Step2[Step 2: Enter Shared Address]
        S2A[Enter street, city, state, postal code, country]
    end

    subgraph Step3[Step 3: Review & Create]
        S3A[Review selected users + address]
        S3B[Submit]
    end

    Step1 --> Step2 --> Step3

    S3B --> LOOP[For each selected user...]

    LOOP --> W1[/"INSERT Location
    (Name = 'User Name Inventory',
     LocationType = 'User Inventory',
     IsInventoryLocation = true,
     PrimaryUserId = user.Id)"/]
    W1 --> W2[/"INSERT Address
    (ParentId = Location.Id,
     shared address fields)"/]

    W2 --> LOOP

    style W1 fill:#d4edda
    style W2 fill:#d4edda
```

### Objects Written (per user)

| Object | Operation | Description |
|--------|-----------|-------------|
| `Location` | INSERT | User Inventory location with `PrimaryUserId` linking it to the rep |
| `Address` | INSERT | Shared address record for the rep's inventory location |

---

## Data Model Reference

```mermaid
erDiagram
    Location ||--o{ Address : "has"
    Location ||--o{ ProductItem : "stores"
    ProductItem ||--o{ ProductBatchItem : "has batches"
    ProductBatchItem }o--|| ProductionBatch : "references"
    ProductItem }o--|| Product2 : "for product"
    ProductionBatch }o--|| Product2 : "for product"
    InventoryOperation }o--|| Location : "source"
    InventoryOperation }o--|| Location : "destination"
    Shipment ||--o{ ShipmentItem : "contains"
    Shipment ||--o{ ProductTransfer : "tracks"
    ProductTransfer }o--|| ProductionBatch : "for batch"
    ProductTransfer }o--|| Product2 : "for product"
    ShipmentItem }o--|| Product2 : "for product"
    Location }o--o| User : "PrimaryUserId"
```
