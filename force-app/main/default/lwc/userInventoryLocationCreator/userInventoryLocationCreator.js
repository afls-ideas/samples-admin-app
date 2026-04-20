import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAvailableUsers from '@salesforce/apex/UserInventoryLocationController.getAvailableUsers';
import getCountryOptions from '@salesforce/apex/UserInventoryLocationController.getCountryOptions';
import getStateOptions from '@salesforce/apex/UserInventoryLocationController.getStateOptions';
import createInventoryLocations from '@salesforce/apex/UserInventoryLocationController.createInventoryLocations';

export default class UserInventoryLocationCreator extends LightningElement {
    currentStep = '1';
    allUsers = [];
    selectedUserMap = {};
    searchTerm = '';
    street = '';
    city = '';
    stateCode = '';
    postalCode = '';
    countryCode = '';
    countryOptions = [];
    stateOptions = [];
    isSubmitting = false;
    creationResults = [];
    isComplete = false;

    @wire(getAvailableUsers)
    wiredUsers({ data, error }) {
        if (data) {
            this.allUsers = data.map(u => ({
                userId: u.userId,
                name: u.name,
                profileName: u.profileName,
                territory: u.territory || ''
            }));
        } else if (error) {
            this.showError('Failed to load users', error);
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

    get isStep1() { return this.currentStep === '1'; }
    get isStep2() { return this.currentStep === '2'; }
    get isStep3() { return this.currentStep === '3'; }

    get filteredUsers() {
        const term = this.searchTerm.toLowerCase();
        let users = this.allUsers;
        if (term) {
            users = users.filter(u =>
                u.name.toLowerCase().includes(term) ||
                (u.territory && u.territory.toLowerCase().includes(term)) ||
                (u.profileName && u.profileName.toLowerCase().includes(term))
            );
        }
        return users.map(u => ({
            ...u,
            isSelected: !!this.selectedUserMap[u.userId]
        }));
    }

    get selectedUsers() {
        return Object.values(this.selectedUserMap);
    }

    get selectedCount() {
        return this.selectedUsers.length;
    }

    get hasSelectedUsers() {
        return this.selectedCount > 0;
    }

    get isNextToAddressDisabled() {
        return !this.hasSelectedUsers;
    }

    get isAddressValid() {
        return this.street && this.city && this.countryCode;
    }

    get isNextToReviewDisabled() {
        return !this.isAddressValid;
    }

    get hasStateOptions() {
        return this.stateOptions.length > 0;
    }

    get successCount() {
        return this.creationResults.filter(r => r.success).length;
    }

    get failureCount() {
        return this.creationResults.filter(r => !r.success).length;
    }

    get hasFailures() {
        return this.failureCount > 0;
    }

    get countryLabel() {
        const opt = this.countryOptions.find(o => o.value === this.countryCode);
        return opt ? opt.label : this.countryCode;
    }

    get stateLabel() {
        const opt = this.stateOptions.find(o => o.value === this.stateCode);
        return opt ? opt.label : this.stateCode;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    handleUserClick(event) {
        const userId = event.currentTarget.dataset.userId;
        const user = this.allUsers.find(u => u.userId === userId);
        if (!user) return;

        const updated = { ...this.selectedUserMap };
        if (updated[userId]) {
            delete updated[userId];
        } else {
            updated[userId] = { ...user };
        }
        this.selectedUserMap = updated;
    }

    handleRemoveUser(event) {
        const userId = event.currentTarget.dataset.userId;
        const updated = { ...this.selectedUserMap };
        delete updated[userId];
        this.selectedUserMap = updated;
    }

    handleClearBasket() {
        this.selectedUserMap = {};
    }

    handleNextToAddress() {
        if (!this.hasSelectedUsers) {
            this.showError('No users selected', 'Please select at least one user.');
            return;
        }
        this.currentStep = '2';
    }

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

    handleNextToReview() {
        this.currentStep = '3';
    }

    handleBack() {
        if (this.currentStep === '3') {
            this.currentStep = '2';
        } else if (this.currentStep === '2') {
            this.currentStep = '1';
        }
    }

    get reviewItems() {
        return this.selectedUsers.map(u => ({
            userId: u.userId,
            userName: u.name,
            locationName: u.name + ' Inventory',
            address: [this.street, this.city, this.stateLabel, this.postalCode, this.countryLabel]
                .filter(Boolean).join(', ')
        }));
    }

    get formattedAddress() {
        return [this.street, this.city, this.stateLabel, this.postalCode, this.countryLabel]
            .filter(Boolean).join(', ');
    }

    handleSubmit() {
        this.isSubmitting = true;
        const userIds = this.selectedUsers.map(u => u.userId);

        createInventoryLocations({
            userIdsJson: JSON.stringify(userIds),
            street: this.street,
            city: this.city,
            stateCode: this.stateCode,
            postalCode: this.postalCode,
            countryCode: this.countryCode
        })
            .then(results => {
                this.creationResults = results;
                this.isComplete = true;
                this.isSubmitting = false;
                const successCount = results.filter(r => r.success).length;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Locations Created',
                    message: successCount + ' of ' + results.length + ' inventory locations created.',
                    variant: successCount === results.length ? 'success' : 'warning'
                }));
            })
            .catch(error => {
                this.isSubmitting = false;
                this.showError('Failed to create locations', error);
            });
    }

    handleReset() {
        this.currentStep = '1';
        this.selectedUserMap = {};
        this.searchTerm = '';
        this.street = '';
        this.city = '';
        this.stateCode = '';
        this.postalCode = '';
        this.countryCode = '';
        this.stateOptions = [];
        this.creationResults = [];
        this.isComplete = false;
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
