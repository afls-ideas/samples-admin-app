import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getTerritoryTree from '@salesforce/apex/UserInventoryLocationController.getTerritoryTree';
import getCountryOptions from '@salesforce/apex/UserInventoryLocationController.getCountryOptions';
import getStateOptions from '@salesforce/apex/UserInventoryLocationController.getStateOptions';
import createInventoryLocations from '@salesforce/apex/UserInventoryLocationController.createInventoryLocations';

export default class UserInventoryLocationCreator extends LightningElement {
    currentStep = '1';
    rawNodes = [];
    selectedUserMap = {};
    expandedMap = {};
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

    @wire(getTerritoryTree)
    wiredTree({ data, error }) {
        if (data) {
            this.rawNodes = data;
        } else if (error) {
            this.showError('Failed to load territory tree', error);
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

    get childrenMap() {
        const map = {};
        for (const node of this.rawNodes) {
            const pid = node.parentTerritoryId || 'root';
            if (!map[pid]) map[pid] = [];
            map[pid].push(node);
        }
        return map;
    }

    get treeData() {
        const term = this.searchTerm.toLowerCase();
        const childrenMap = this.childrenMap;

        const buildNode = (raw) => {
            const children = (childrenMap[raw.territoryId] || []).map(c => buildNode(c));
            const eligibleUsers = (raw.users || []).filter(u => !u.hasLocation);
            const users = eligibleUsers.map(u => ({
                ...u,
                isSelected: !!this.selectedUserMap[u.userId],
                key: raw.territoryId + '-' + u.userId
            }));

            const hasMatchingUser = term
                ? users.some(u => u.name.toLowerCase().includes(term))
                : users.length > 0;
            const hasMatchingChild = children.some(c => c.visible);
            const nameMatches = term ? raw.name.toLowerCase().includes(term) : false;
            const visible = hasMatchingUser || hasMatchingChild || nameMatches;

            const filteredUsers = term
                ? users.filter(u => u.name.toLowerCase().includes(term) || nameMatches)
                : users;

            const isExpanded = !!this.expandedMap[raw.territoryId];

            return {
                territoryId: raw.territoryId,
                name: raw.name,
                users: filteredUsers,
                children: children.filter(c => c.visible),
                visible,
                isExpanded,
                hasChildren: children.filter(c => c.visible).length > 0 || filteredUsers.length > 0,
                expandIcon: isExpanded ? 'utility:chevrondown' : 'utility:chevronright',
                userCount: this._countEligibleUsersBelow(raw.territoryId, childrenMap)
            };
        };

        const roots = (childrenMap['root'] || []).map(r => buildNode(r));
        return roots.filter(r => r.visible);
    }

    _countEligibleUsersBelow(territoryId, childrenMap) {
        let count = 0;
        const node = this.rawNodes.find(n => n.territoryId === territoryId);
        if (node) {
            count += (node.users || []).filter(u => !u.hasLocation).length;
        }
        for (const child of (childrenMap[territoryId] || [])) {
            count += this._countEligibleUsersBelow(child.territoryId, childrenMap);
        }
        return count;
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
        this.searchTerm = event.target.value || '';
        if (this.searchTerm) {
            const expanded = { ...this.expandedMap };
            for (const node of this.rawNodes) {
                expanded[node.territoryId] = true;
            }
            this.expandedMap = expanded;
        }
    }

    handleToggle(event) {
        const tid = event.currentTarget.dataset.territoryId;
        const updated = { ...this.expandedMap };
        updated[tid] = !updated[tid];
        this.expandedMap = updated;
    }

    handleUserSelect(event) {
        const userId = event.currentTarget.dataset.userId;
        const userName = event.currentTarget.dataset.userName;
        const profileName = event.currentTarget.dataset.profileName;
        const updated = { ...this.selectedUserMap };
        if (updated[userId]) {
            delete updated[userId];
        } else {
            updated[userId] = { userId, name: userName, profileName };
        }
        this.selectedUserMap = updated;
    }

    handleTerritorySelect(event) {
        const tid = event.currentTarget.dataset.territoryId;
        const users = this._collectUsersBelow(tid);
        const allSelected = users.every(u => this.selectedUserMap[u.userId]);
        const updated = { ...this.selectedUserMap };
        if (allSelected) {
            for (const u of users) {
                delete updated[u.userId];
            }
        } else {
            for (const u of users) {
                if (!updated[u.userId]) {
                    updated[u.userId] = { userId: u.userId, name: u.name, profileName: u.profileName };
                }
            }
        }
        this.selectedUserMap = updated;
    }

    _collectUsersBelow(territoryId) {
        const results = [];
        const node = this.rawNodes.find(n => n.territoryId === territoryId);
        if (node) {
            for (const u of (node.users || [])) {
                if (!u.hasLocation) {
                    results.push(u);
                }
            }
        }
        const childrenMap = this.childrenMap;
        for (const child of (childrenMap[territoryId] || [])) {
            results.push(...this._collectUsersBelow(child.territoryId));
        }
        return results;
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
                const sc = results.filter(r => r.success).length;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Locations Created',
                    message: sc + ' of ' + results.length + ' inventory locations created.',
                    variant: sc === results.length ? 'success' : 'warning'
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
        this.expandedMap = {};
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
