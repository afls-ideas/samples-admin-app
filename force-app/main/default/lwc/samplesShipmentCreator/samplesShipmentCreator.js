import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getWarehouses from '@salesforce/apex/SamplesShipmentController.getWarehouses';
import getReps from '@salesforce/apex/SamplesShipmentController.getReps';
import getWarehouseInventory from '@salesforce/apex/SamplesShipmentController.getWarehouseInventory';
import createShipment from '@salesforce/apex/SamplesShipmentController.createShipment';

export default class SamplesShipmentCreator extends LightningElement {
    currentStep = '1';
    selectedWarehouseId = '';
    selectedRepLocationId = '';
    warehouseOptions = [];
    allRepOptions = [];
    repSearchTerm = '';
    repDropdownOpen = false;
    inventoryData = [];
    selectedItems = [];
    isLoading = false;
    isLoadingPreview = false;
    isSubmitting = false;
    warehousePreview = [];
    shipmentCreated = false;
    createdRecordId = null;

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

    @wire(getReps)
    wiredReps({ data, error }) {
        if (data) {
            this.allRepOptions = data.map(loc => ({
                label: loc.userName || loc.name,
                territory: loc.territory || '',
                value: loc.locationId
            }));
        } else if (error) {
            this.showError('Failed to load reps', error);
        }
    }

    get isStep1() {
        return this.currentStep === '1';
    }

    get isStep2() {
        return this.currentStep === '2';
    }

    get isStep3() {
        return this.currentStep === '3';
    }

    get isNextDisabled() {
        return !(this.selectedWarehouseId && this.selectedRepLocationId);
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

    get selectedRepName() {
        const opt = this.allRepOptions.find(o => o.value === this.selectedRepLocationId);
        return opt ? opt.label : '';
    }

    get filteredRepOptions() {
        const term = this.repSearchTerm.toLowerCase();
        if (!term) return this.allRepOptions;
        return this.allRepOptions.filter(r =>
            r.label.toLowerCase().includes(term) ||
            r.territory.toLowerCase().includes(term)
        );
    }

    get noRepResults() {
        return this.filteredRepOptions.length === 0;
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

    handleRepSearch(event) {
        this.repSearchTerm = event.detail.value || '';
        if (!this.repSearchTerm) {
            this.selectedRepLocationId = '';
        }
        this.repDropdownOpen = true;
    }

    handleRepFocus() {
        this.repDropdownOpen = true;
        this._repBlurListener = (e) => {
            const container = this.template.querySelector('.rep-search-container');
            if (container && !container.contains(e.target)) {
                this.repDropdownOpen = false;
                document.removeEventListener('click', this._repBlurListener);
            }
        };
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => document.addEventListener('click', this._repBlurListener), 0);
    }

    handleRepSelect(event) {
        const value = event.currentTarget.dataset.value;
        const rep = this.allRepOptions.find(r => r.value === value);
        if (rep) {
            this.selectedRepLocationId = rep.value;
            this.repSearchTerm = rep.label;
            this.repDropdownOpen = false;
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

        createShipment({
            warehouseLocationId: this.selectedWarehouseId,
            repLocationId: this.selectedRepLocationId,
            lineItemsJson: JSON.stringify(lineItems)
        })
            .then(result => {
                this.createdRecordId = result;
                this.shipmentCreated = true;
                this.isSubmitting = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Shipment Created',
                    message: 'Shipment sent to ' + this.selectedRepName,
                    variant: 'success'
                }));
            })
            .catch(error => {
                this.isSubmitting = false;
                this.showError('Failed to create shipment', error);
            });
    }

    handleReset() {
        this.currentStep = '1';
        this.selectedWarehouseId = '';
        this.selectedRepLocationId = '';
        this.repSearchTerm = '';
        this.inventoryData = [];
        this.warehousePreview = [];
        this.selectedItems = [];
        this.shipmentCreated = false;
        this.createdRecordId = null;
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
