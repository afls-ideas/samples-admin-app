import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getWarehouses from '@salesforce/apex/SamplesShipmentController.getWarehouses';
import getRepTerritoryTree from '@salesforce/apex/SamplesShipmentController.getRepTerritoryTree';
import getWarehouseInventory from '@salesforce/apex/SamplesShipmentController.getWarehouseInventory';
import createShipments from '@salesforce/apex/SamplesShipmentController.createShipments';

export default class SamplesShipmentCreator extends LightningElement {
    currentStep = '1';
    selectedWarehouseId = '';
    selectedRepMap = {};
    warehouseOptions = [];
    rawNodes = [];
    repExpandedMap = {};
    repSearchTerm = '';
    inventoryData = [];
    selectedItems = [];
    isLoading = false;
    isLoadingPreview = false;
    isSubmitting = false;
    warehousePreview = [];
    shipmentCreated = false;
    shipmentResults = [];

    @wire(getWarehouses)
    wiredWarehouses({ data, error }) {
        if (data) {
            this.warehouseOptions = data.map(loc => ({
                label: loc.name,
                value: loc.locationId
            }));
        } else if (error) {
            this.showError('Failed to load warehouses', error);
        }
    }

    @wire(getRepTerritoryTree)
    wiredRepTree({ data, error }) {
        if (data) {
            this.rawNodes = data;
        } else if (error) {
            this.showError('Failed to load rep territories', error);
        }
    }

    get isStep1() { return this.currentStep === '1'; }
    get isStep2() { return this.currentStep === '2'; }
    get isStep3() { return this.currentStep === '3'; }

    get isNextDisabled() {
        return !(this.selectedWarehouseId && this.hasSelectedReps);
    }

    get isReviewDisabled() {
        return !this.inventoryData.some(product =>
            product.batches.some(batch => batch.selectedQuantity > 0)
        );
    }

    get selectedWarehouseName() {
        const opt = this.warehouseOptions.find(o => o.value === this.selectedWarehouseId);
        return opt ? opt.label : '';
    }

    get totalQuantity() {
        return this.selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    }

    get hasNoInventory() {
        return this.inventoryData.length === 0;
    }

    get hasWarehousePreview() {
        return this.warehousePreview.length > 0;
    }

    // --- Multi-select rep management ---

    get selectedReps() {
        return Object.values(this.selectedRepMap);
    }

    get selectedRepCount() {
        return this.selectedReps.length;
    }

    get hasSelectedReps() {
        return this.selectedRepCount > 0;
    }

    get selectedRepNames() {
        return this.selectedReps.map(r => r.name).join(', ');
    }

    get shipmentSuccessCount() {
        return this.shipmentResults.filter(r => r.success).length;
    }

    get shipmentFailureCount() {
        return this.shipmentResults.filter(r => !r.success).length;
    }

    get hasShipmentFailures() {
        return this.shipmentFailureCount > 0;
    }

    // --- Territory tree ---

    get childrenMap() {
        const map = {};
        for (const node of this.rawNodes) {
            const pid = node.parentTerritoryId || 'root';
            if (!map[pid]) map[pid] = [];
            map[pid].push(node);
        }
        return map;
    }

    get repTreeData() {
        const term = this.repSearchTerm.toLowerCase();
        const childrenMap = this.childrenMap;

        const buildNode = (raw) => {
            const children = (childrenMap[raw.territoryId] || []).map(c => buildNode(c));
            const users = (raw.users || []).map(u => ({
                ...u,
                isSelected: !!this.selectedRepMap[u.locationId],
                key: raw.territoryId + '-' + u.userId
            }));

            let visible;
            let filteredUsers;
            if (term) {
                const hasMatchingUser = users.some(u => u.name.toLowerCase().includes(term));
                const hasMatchingChild = children.some(c => c.visible);
                const nameMatches = raw.name.toLowerCase().includes(term);
                visible = hasMatchingUser || hasMatchingChild || nameMatches;
                filteredUsers = users.filter(u => u.name.toLowerCase().includes(term) || nameMatches);
            } else {
                const hasChildTerritories = (childrenMap[raw.territoryId] || []).length > 0;
                visible = hasChildTerritories || users.length > 0;
                filteredUsers = users;
            }

            const isExpanded = !!this.repExpandedMap[raw.territoryId];

            return {
                territoryId: raw.territoryId,
                name: raw.name,
                users: filteredUsers,
                children: children.filter(c => c.visible),
                visible,
                isExpanded,
                hasChildren: children.filter(c => c.visible).length > 0 || filteredUsers.length > 0,
                expandIcon: isExpanded ? 'utility:chevrondown' : 'utility:chevronright',
                repCount: this._countRepsBelow(raw.territoryId, childrenMap)
            };
        };

        const roots = (childrenMap['root'] || []).map(r => buildNode(r));
        return roots.filter(r => r.visible);
    }

    _countRepsBelow(territoryId, childrenMap) {
        let count = 0;
        const node = this.rawNodes.find(n => n.territoryId === territoryId);
        if (node) {
            count += (node.users || []).length;
        }
        for (const child of (childrenMap[territoryId] || [])) {
            count += this._countRepsBelow(child.territoryId, childrenMap);
        }
        return count;
    }

    _collectRepsBelow(territoryId) {
        const results = [];
        const node = this.rawNodes.find(n => n.territoryId === territoryId);
        if (node) {
            for (const u of (node.users || [])) {
                results.push(u);
            }
        }
        const childrenMap = this.childrenMap;
        for (const child of (childrenMap[territoryId] || [])) {
            results.push(...this._collectRepsBelow(child.territoryId));
        }
        return results;
    }

    handleRepTreeToggle(event) {
        const tid = event.currentTarget.dataset.territoryId;
        const updated = { ...this.repExpandedMap };
        updated[tid] = !updated[tid];
        this.repExpandedMap = updated;
    }

    handleRepTreeSearch(event) {
        this.repSearchTerm = event.target.value || '';
        if (this.repSearchTerm) {
            const expanded = { ...this.repExpandedMap };
            for (const node of this.rawNodes) {
                expanded[node.territoryId] = true;
            }
            this.repExpandedMap = expanded;
        }
    }

    handleRepSelect(event) {
        const locationId = event.currentTarget.dataset.locationId;
        const userName = event.currentTarget.dataset.userName;
        const updated = { ...this.selectedRepMap };
        if (updated[locationId]) {
            delete updated[locationId];
        } else {
            updated[locationId] = { locationId, name: userName };
        }
        this.selectedRepMap = updated;
    }

    handleTerritorySelect(event) {
        const tid = event.currentTarget.dataset.territoryId;
        const reps = this._collectRepsBelow(tid);
        const allSelected = reps.every(u => this.selectedRepMap[u.locationId]);
        const updated = { ...this.selectedRepMap };
        if (allSelected) {
            for (const u of reps) {
                delete updated[u.locationId];
            }
        } else {
            for (const u of reps) {
                if (!updated[u.locationId]) {
                    updated[u.locationId] = { locationId: u.locationId, name: u.name };
                }
            }
        }
        this.selectedRepMap = updated;
    }

    handleRemoveRep(event) {
        const locationId = event.currentTarget.dataset.locationId;
        const updated = { ...this.selectedRepMap };
        delete updated[locationId];
        this.selectedRepMap = updated;
    }

    handleClearReps() {
        this.selectedRepMap = {};
    }

    // --- Warehouse ---

    handleWarehouseChange(event) {
        this.selectedWarehouseId = event.detail.value;
        this.inventoryData = [];
        this.warehousePreview = [];

        if (this.selectedWarehouseId) {
            this.isLoadingPreview = true;
            getWarehouseInventory({ warehouseLocationId: this.selectedWarehouseId })
                .then(data => {
                    this.warehousePreview = data.map(pi => ({
                        productItemId: pi.productItemId,
                        productName: pi.productName,
                        quantityOnHand: pi.quantityOnHand,
                        batchCount: (pi.batches || []).length
                    }));
                    this.isLoadingPreview = false;
                })
                .catch(error => {
                    this.isLoadingPreview = false;
                    this.showError('Failed to load warehouse inventory', error);
                });
        }
    }

    handleNext() {
        this.isLoading = true;
        this.currentStep = '2';

        getWarehouseInventory({ warehouseLocationId: this.selectedWarehouseId })
            .then(data => {
                this.inventoryData = data.map((pi, pIdx) => ({
                    key: pi.productItemId,
                    productName: pi.productName,
                    product2Id: pi.product2Id,
                    quantityOnHand: pi.quantityOnHand,
                    batches: (pi.batches || []).map((b, bIdx) => ({
                        key: b.batchItemId,
                        productionBatchId: b.productionBatchId,
                        batchName: b.batchName,
                        expirationDate: b.expirationDate,
                        remainingQuantity: b.remainingQuantity,
                        selectedQuantity: 0,
                        productIndex: pIdx,
                        batchIndex: bIdx
                    }))
                }));
                this.isLoading = false;
            })
            .catch(error => {
                this.showError('Failed to load warehouse inventory', error);
                this.isLoading = false;
            });
    }

    handleQuantityChange(event) {
        const pIdx = parseInt(event.target.dataset.productIndex, 10);
        const bIdx = parseInt(event.target.dataset.batchIndex, 10);
        const value = parseFloat(event.target.value) || 0;

        const updated = JSON.parse(JSON.stringify(this.inventoryData));
        updated[pIdx].batches[bIdx].selectedQuantity = value;
        this.inventoryData = updated;
    }

    handleReview() {
        const items = [];
        this.inventoryData.forEach(product => {
            product.batches.forEach(batch => {
                if (batch.selectedQuantity > 0) {
                    items.push({
                        key: batch.key,
                        product2Id: product.product2Id,
                        productName: product.productName,
                        productionBatchId: batch.productionBatchId,
                        batchName: batch.batchName,
                        expirationDate: batch.expirationDate,
                        quantity: batch.selectedQuantity
                    });
                }
            });
        });
        this.selectedItems = items;
        this.currentStep = '3';
    }

    handleBack() {
        if (this.currentStep === '3') {
            this.currentStep = '2';
        } else if (this.currentStep === '2') {
            this.currentStep = '1';
        }
    }

    handleSubmit() {
        this.isSubmitting = true;

        const lineItems = this.selectedItems.map(item => ({
            product2Id: item.product2Id,
            productionBatchId: item.productionBatchId,
            quantity: item.quantity,
            productName: item.productName,
            batchName: item.batchName
        }));

        const repLocationIds = this.selectedReps.map(r => r.locationId);

        createShipments({
            warehouseLocationId: this.selectedWarehouseId,
            repLocationIdsJson: JSON.stringify(repLocationIds),
            lineItemsJson: JSON.stringify(lineItems)
        })
            .then(results => {
                this.shipmentResults = results;
                this.shipmentCreated = true;
                this.isSubmitting = false;
                const sc = results.filter(r => r.success).length;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Shipments Created',
                    message: sc + ' of ' + results.length + ' shipments created.',
                    variant: sc === results.length ? 'success' : 'warning'
                }));
            })
            .catch(error => {
                this.isSubmitting = false;
                this.showError('Failed to create shipments', error);
            });
    }

    handleReset() {
        this.currentStep = '1';
        this.selectedWarehouseId = '';
        this.selectedRepMap = {};
        this.repSearchTerm = '';
        this.repExpandedMap = {};
        this.inventoryData = [];
        this.warehousePreview = [];
        this.selectedItems = [];
        this.shipmentCreated = false;
        this.shipmentResults = [];
    }

    handleManageInventory() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { page: 'inventory', locationId: this.selectedWarehouseId }
        }));
    }

    handleBackToMenu() {
        this.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'home' } }));
    }

    showError(title, error) {
        let message = 'Unknown error';
        if (error?.body?.message) {
            message = error.body.message;
        } else if (error?.message) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        }
        this.dispatchEvent(new ShowToastEvent({
            title,
            message,
            variant: 'error'
        }));
    }
}
