import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getLocationTypes from '@salesforce/apex/SourceLocationController.getLocationTypes';
import getCountryOptions from '@salesforce/apex/SourceLocationController.getCountryOptions';
import getStateOptions from '@salesforce/apex/SourceLocationController.getStateOptions';
import createSourceLocation from '@salesforce/apex/SourceLocationController.createSourceLocation';

export default class SourceLocationCreator extends LightningElement {
    locationName = '';
    locationType = 'Warehouse';
    isInventoryLocation = true;
    street = '';
    city = '';
    stateCode = '';
    postalCode = '';
    countryCode = '';
    locationTypeOptions = [];
    countryOptions = [];
    stateOptions = [];
    isCreatingLocation = false;
    isComplete = false;
    createdLocationId = null;

    @wire(getLocationTypes)
    wiredTypes({ data, error }) {
        if (data) {
            this.locationTypeOptions = data.map(o => ({ label: o.label, value: o.value }));
        } else if (error) {
            this.showError('Failed to load location types', error);
        }
    }

    @wire(getCountryOptions)
    wiredCountries({ data, error }) {
        if (data) {
            this.countryOptions = data.map(o => ({ label: o.label, value: o.value }));
        } else if (error) {
            this.showError('Failed to load countries', error);
        }
    }

    get hasStateOptions() {
        return this.stateOptions.length > 0;
    }

    get isFormValid() {
        return this.locationName && this.locationType && this.street && this.city && this.countryCode;
    }

    get isCreateDisabled() {
        return !this.isFormValid || this.isCreatingLocation;
    }

    handleNameChange(event) { this.locationName = event.target.value; }
    handleTypeChange(event) { this.locationType = event.detail.value; }
    handleInventoryToggle(event) { this.isInventoryLocation = event.target.checked; }
    handleStreetChange(event) { this.street = event.target.value; }
    handleCityChange(event) { this.city = event.target.value; }
    handlePostalCodeChange(event) { this.postalCode = event.target.value; }

    handleCountryChange(event) {
        this.countryCode = event.detail.value;
        this.stateCode = '';
        this.stateOptions = [];
        if (this.countryCode) {
            getStateOptions({ countryCode: this.countryCode })
                .then(data => {
                    this.stateOptions = data.map(o => ({ label: o.label, value: o.value }));
                })
                .catch(() => {
                    this.stateOptions = [];
                });
        }
    }

    handleStateChange(event) {
        this.stateCode = event.detail?.value ?? event.target.value;
    }

    handleCreateLocation() {
        this.isCreatingLocation = true;
        createSourceLocation({
            name: this.locationName,
            locationType: this.locationType,
            isInventoryLocation: this.isInventoryLocation,
            street: this.street,
            city: this.city,
            stateCode: this.stateCode,
            postalCode: this.postalCode,
            countryCode: this.countryCode
        })
            .then(locationId => {
                this.createdLocationId = locationId;
                this.isComplete = true;
                this.isCreatingLocation = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Location Created',
                    message: this.locationName + ' created successfully.',
                    variant: 'success'
                }));
            })
            .catch(error => {
                this.isCreatingLocation = false;
                this.showError('Failed to create location', error);
            });
    }

    handleAddInventory() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { page: 'inventory', locationId: this.createdLocationId }
        }));
    }

    handleReset() {
        this.locationName = '';
        this.locationType = 'Warehouse';
        this.isInventoryLocation = true;
        this.street = '';
        this.city = '';
        this.stateCode = '';
        this.postalCode = '';
        this.countryCode = '';
        this.stateOptions = [];
        this.isComplete = false;
        this.createdLocationId = null;
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
