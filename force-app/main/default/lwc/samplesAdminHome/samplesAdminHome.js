import { LightningElement } from 'lwc';

export default class SamplesAdminHome extends LightningElement {
    currentPage = 'home';
    inventoryLocationId = '';

    get isHome() { return this.currentPage === 'home'; }
    get isShipment() { return this.currentPage === 'shipment'; }
    get isInventory() { return this.currentPage === 'inventory'; }
    get isSourceLocation() { return this.currentPage === 'sourceLocation'; }
    get isUserLocations() { return this.currentPage === 'userLocations'; }

    handleNavigateShipment() { this.currentPage = 'shipment'; }
    handleNavigateInventory() {
        this.inventoryLocationId = '';
        this.currentPage = 'inventory';
    }
    handleNavigateSourceLocation() { this.currentPage = 'sourceLocation'; }
    handleNavigateUserLocations() { this.currentPage = 'userLocations'; }

    handleNavigateEvent(event) {
        const page = event.detail.page;
        if (page === 'inventory' && event.detail.locationId) {
            this.inventoryLocationId = event.detail.locationId;
        } else {
            this.inventoryLocationId = '';
        }
        this.currentPage = page;
    }
}
