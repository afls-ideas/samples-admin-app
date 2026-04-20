# Samples Admin App — Features

## Released

### v1.0 — Samples Shipment Creator

**Status:** Released

Send sample shipments from a warehouse to a rep's inventory.

- 3-step wizard: Select source/destination, pick products with batches and quantities, review and submit
- Creates the full record chain: `InventoryOperation` → `Shipment` → `ShipmentItem` → `ProductTransfer`
- Shipment appears in the rep's Inventory Operations Timeline and Received Inventory Acknowledgements panel
- Warehouse inventory preview on Step 1 after selecting source location
- Chevron progress indicator across steps
- Permission set (`Samples_Shipment_Admin`) for tab and Apex access

---

## In Progress

### v1.1 — Create User Inventory Locations

**Status:** In Progress

Mass-create inventory locations for multiple users at a shared address.

**Problem:** Before a rep can receive sample shipments, they need an inventory Location record. Today this is done one user at a time. For offices where reps share a pickup location, the admin has to repeat the same address entry for each rep.

**Design:**

Step 1 — Select Users
- Show a searchable list of all active users who do NOT already have an inventory location
- Multi-select users into a "basket" panel on the right
- Users already in the basket are visually marked and can be removed
- Show count of selected users

Step 2 — Enter Location Details
- Address fields: Street, City, State, Postal Code, Country
- All selected users will share this address
- Option to set a location name pattern (e.g., "{User Name} Inventory")

Step 3 — Review & Confirm
- Summary table: each user × the shared address
- Location name preview for each user
- Confirm button creates:
  - 1 `Location` per user (`LocationType = 'User Inventory'`, `IsInventoryLocation = true`, `PrimaryUserId = user`)
  - 1 `Address` per location (`ParentId = location`, `AddressType = 'Mailing'`)
- Success summary showing created records, any failures (e.g., user already has a location)

**Constraints:**
- Platform enforces one inventory location per user — skip users who already have one
- `IsInventoryLocation` cannot be set to `false` while `PrimaryUserId` is set
- Script should be idempotent — re-running for the same users should not fail

---

## Planned

### v1.2 — Manager-to-Rep Inventory Transfers

Transfer sample inventory between reps on the same team. A manager selects a source rep and destination rep, picks products/batches, and submits. Reuses the same `InventoryOperation` → `ProductTransfer` pattern but with a rep Location as the source instead of a warehouse.
