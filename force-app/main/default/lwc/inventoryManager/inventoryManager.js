import { LightningElement, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getInventoryLocations from '@salesforce/apex/SourceLocationController.getInventoryLocations';
import getLocationInventory from '@salesforce/apex/SourceLocationController.getLocationInventory';
import getSampleProducts from '@salesforce/apex/SourceLocationController.getSampleProducts';
import getProductionBatches from '@salesforce/apex/SourceLocationController.getProductionBatches';
import addInventoryToLocation from '@salesforce/apex/SourceLocationController.addInventoryToLocation';

export default class InventoryManager extends LightningElement {
    _preselectedLocationId = '';
    selectedLocationId = '';
    locationOptions = [];
    existingInventory = [];
    productOptions = [];
    allBatches = [];
    inventoryLines = [];
    lineKeyCounter = 0;
    isLoadingInventory = false;
    isSaving = false;
    isSaveComplete = false;
    saveMessage = '';
    locationLoaded = false;

    @api
    get preselectedLocationId() {
        return this._preselectedLocationId;
    }
    set preselectedLocationId(value) {
        this._preselectedLocationId = value;
        if (value && this.locationOptions.length > 0) {
            this.selectedLocationId = value;
            this.loadInventory();
        }
    }

    @wire(getInventoryLocations)
    wiredLocations({ data, error }) {
        if (data) {
            this.locationOptions = data.map(l => ({
                label: l.name + ' (' + l.locationType + ')',
                value: l.locationId
            }));
            if (this._preselectedLocationId && !this.locationLoaded) {
                this.selectedLocationId = this._preselectedLocationId;
                this.locationLoaded = true;
                this.loadInventory();
            }
        } else if (error) {
            this.showError('Failed to load locations', error);
        }
    }

    @wire(getSampleProducts)
    wiredProducts({ data, error }) {
        if (data) {
            this.productOptions = data.map(p => ({
                label: p.productCode ? p.name + ' (' + p.productCode + ')' : p.name,
                value: p.productId
            }));
        } else if (error) {
            this.showError('Failed to load products', error);
        }
    }

    @wire(getProductionBatches)
    wiredBatches({ data, error }) {
        if (data) {
            this.allBatches = data.map(b => ({
                label: b.name,
                value: b.batchId,
                productId: b.productId
            }));
        } else if (error) {
            this.showError('Failed to load production batches', error);
        }
    }

    get showInventory() {
        return this.selectedLocationId && !this.isLoadingInventory;
    }

    get hasExistingInventory() {
        return this.existingInventory.length > 0;
    }

    get displayLines() {
        return this.inventoryLines.map(l => {
            const filtered = this.allBatches.filter(b => b.productId === l.product2Id);
            return {
                ...l,
                batchOptions: filtered,
                noBatchOptions: !l.product2Id || filtered.length === 0
            };
        });
    }

    get isSaveDisabled() {
        if (this.isSaving) return true;
        return !this.inventoryLines.some(l => l.product2Id && l.productionBatchId && l.quantity > 0);
    }

    handleLocationChange(event) {
        this.selectedLocationId = event.detail.value;
        this.isSaveComplete = false;
        this.loadInventory();
    }

    loadInventory() {
        if (!this.selectedLocationId) return;
        this.isLoadingInventory = true;
        this.existingInventory = [];
        this.inventoryLines = [];
        this.lineKeyCounter = 0;

        getLocationInventory({ locationId: this.selectedLocationId })
            .then(data => {
                this.existingInventory = data.map(inv => ({
                    ...inv,
                    hasBatches: inv.batches && inv.batches.length > 0
                }));
                this.isLoadingInventory = false;
                this.addEmptyLine();
            })
            .catch(error => {
                this.isLoadingInventory = false;
                this.showError('Failed to load inventory', error);
            });
    }

    addEmptyLine() {
        this.lineKeyCounter++;
        this.inventoryLines = [
            ...this.inventoryLines,
            {
                key: 'line-' + this.lineKeyCounter,
                product2Id: '',
                productionBatchId: '',
                quantity: null
            }
        ];
    }

    handleAddLine() {
        this.addEmptyLine();
    }

    handleRemoveLine(event) {
        const key = event.currentTarget.dataset.lineKey;
        this.inventoryLines = this.inventoryLines.filter(l => l.key !== key);
        if (this.inventoryLines.length === 0) {
            this.addEmptyLine();
        }
    }

    handleProductChange(event) {
        const key = event.currentTarget.dataset.lineKey;
        this.inventoryLines = this.inventoryLines.map(l =>
            l.key === key ? { ...l, product2Id: event.detail.value, productionBatchId: '' } : l
        );
    }

    handleBatchChange(event) {
        const key = event.currentTarget.dataset.lineKey;
        this.inventoryLines = this.inventoryLines.map(l =>
            l.key === key ? { ...l, productionBatchId: event.detail.value } : l
        );
    }

    handleQuantityChange(event) {
        const key = event.currentTarget.dataset.lineKey;
        const qty = parseFloat(event.target.value) || 0;
        this.inventoryLines = this.inventoryLines.map(l =>
            l.key === key ? { ...l, quantity: qty } : l
        );
    }

    handleSaveInventory() {
        const validLines = this.inventoryLines.filter(
            l => l.product2Id && l.productionBatchId && l.quantity > 0
        );

        if (validLines.length === 0) {
            this.showError('No inventory', 'Please add at least one product with a batch and quantity.');
            return;
        }

        const lineItems = validLines.map(l => {
            const prodOpt = this.productOptions.find(o => o.value === l.product2Id);
            const batchOpt = this.allBatches.find(o => o.value === l.productionBatchId);
            return {
                product2Id: l.product2Id,
                productionBatchId: l.productionBatchId,
                quantity: l.quantity,
                productName: prodOpt ? prodOpt.label : '',
                batchName: batchOpt ? batchOpt.label : ''
            };
        });

        this.isSaving = true;
        addInventoryToLocation({
            locationId: this.selectedLocationId,
            lineItemsJson: JSON.stringify(lineItems)
        })
            .then(result => {
                this.saveMessage =
                    result.productItemsCreated + ' new product(s) and ' +
                    result.batchItemsCreated + ' batch record(s) added.';
                this.isSaveComplete = true;
                this.isSaving = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Inventory Added',
                    message: this.saveMessage,
                    variant: 'success'
                }));
            })
            .catch(error => {
                this.isSaving = false;
                this.showError('Failed to save inventory', error);
            });
    }

    handleDone() {
        this.isSaveComplete = false;
        this.loadInventory();
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
        this.dispatchEvent(new ShowToastEvent({ title, message, variant: 'error' }));
    }
}
