public with sharing class UserInventoryLocationController {

    public class UserOption {
        @AuraEnabled public Id userId;
        @AuraEnabled public String name;
        @AuraEnabled public String profileName;
        @AuraEnabled public String territory;
    }

    public class LocationResult {
        @AuraEnabled public Id userId;
        @AuraEnabled public String userName;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public Id locationId;
    }

    @AuraEnabled(cacheable=true)
    public static List<UserOption> getAvailableUsers() {
        Set<Id> usersWithLocation = new Set<Id>();
        for (Schema.Location loc : [
            SELECT PrimaryUserId
            FROM Location
            WHERE LocationType = 'User Inventory'
              AND IsInventoryLocation = true
              AND PrimaryUserId != null
        ]) {
            usersWithLocation.add(loc.PrimaryUserId);
        }

        Set<Id> allCandidateIds = new Set<Id>();
        List<User> users = [
            SELECT Id, Name, Profile.Name
            FROM User
            WHERE IsActive = true
              AND Id NOT IN :usersWithLocation
            ORDER BY Name
        ];
        for (User u : users) {
            allCandidateIds.add(u.Id);
        }

        Map<Id, String> territoryMap = new Map<Id, String>();
        for (UserTerritory2Association uta : [
            SELECT UserId, Territory2.Name
            FROM UserTerritory2Association
            WHERE UserId IN :allCandidateIds AND IsActive = true
            ORDER BY Territory2.Name
        ]) {
            if (!territoryMap.containsKey(uta.UserId)) {
                territoryMap.put(uta.UserId, uta.Territory2.Name);
            }
        }

        List<UserOption> results = new List<UserOption>();
        for (User u : users) {
            UserOption opt = new UserOption();
            opt.userId = u.Id;
            opt.name = u.Name;
            opt.profileName = u.Profile.Name;
            opt.territory = territoryMap.containsKey(u.Id)
                ? territoryMap.get(u.Id) : '';
            results.add(opt);
        }
        return results;
    }

    public class PicklistOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }

    @AuraEnabled(cacheable=true)
    public static List<PicklistOption> getCountryOptions() {
        List<PicklistOption> options = new List<PicklistOption>();
        for (Schema.PicklistEntry pe : Schema.Address.CountryCode.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                PicklistOption opt = new PicklistOption();
                opt.label = pe.getLabel();
                opt.value = pe.getValue();
                options.add(opt);
            }
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static List<PicklistOption> getStateOptions(String countryCode) {
        List<PicklistOption> options = new List<PicklistOption>();
        Schema.DescribeFieldResult stateField = Schema.Address.StateCode.getDescribe();
        for (Schema.PicklistEntry pe : stateField.getPicklistValues()) {
            if (pe.isActive()) {
                PicklistOption opt = new PicklistOption();
                opt.label = pe.getLabel();
                opt.value = pe.getValue();
                options.add(opt);
            }
        }
        return options;
    }

    @AuraEnabled
    public static List<LocationResult> createInventoryLocations(
        String userIdsJson,
        String street,
        String city,
        String stateCode,
        String postalCode,
        String countryCode
    ) {
        List<Id> userIds = (List<Id>) JSON.deserialize(userIdsJson, List<Id>.class);

        if (userIds == null || userIds.isEmpty()) {
            throw new AuraHandledException('No users selected.');
        }

        Map<Id, User> userMap = new Map<Id, User>([
            SELECT Id, Name FROM User WHERE Id IN :userIds
        ]);

        Set<Id> existingUserIds = new Set<Id>();
        for (Schema.Location loc : [
            SELECT PrimaryUserId
            FROM Location
            WHERE LocationType = 'User Inventory'
              AND IsInventoryLocation = true
              AND PrimaryUserId IN :userIds
        ]) {
            existingUserIds.add(loc.PrimaryUserId);
        }

        List<LocationResult> results = new List<LocationResult>();

        for (Id uid : userIds) {
            LocationResult lr = new LocationResult();
            lr.userId = uid;
            lr.userName = userMap.containsKey(uid) ? userMap.get(uid).Name : 'Unknown';

            if (existingUserIds.contains(uid)) {
                lr.success = false;
                lr.message = 'Already has an inventory location';
                results.add(lr);
                continue;
            }

            try {
                Schema.Location loc = new Schema.Location();
                loc.Name = lr.userName + ' Inventory';
                loc.LocationType = 'User Inventory';
                loc.IsInventoryLocation = true;
                loc.PrimaryUserId = uid;
                insert loc;

                Schema.Address addr = new Schema.Address();
                addr.ParentId = loc.Id;
                addr.Street = street;
                addr.City = city;
                addr.StateCode = stateCode;
                addr.PostalCode = postalCode;
                addr.CountryCode = countryCode;
                addr.AddressType = 'Mailing';
                insert addr;

                lr.success = true;
                lr.locationId = loc.Id;
                lr.message = 'Created';
            } catch (Exception e) {
                lr.success = false;
                lr.message = e.getMessage();
            }

            results.add(lr);
        }

        return results;
    }
}
