public with sharing class UserInventoryLocationController {

    public class TerritoryNode {
        @AuraEnabled public Id territoryId;
        @AuraEnabled public String name;
        @AuraEnabled public Id parentTerritoryId;
        @AuraEnabled public List<TerritoryUser> users;
    }

    public class TerritoryUser {
        @AuraEnabled public Id userId;
        @AuraEnabled public String name;
        @AuraEnabled public String profileName;
        @AuraEnabled public Boolean hasLocation;
    }

    public class LocationResult {
        @AuraEnabled public Id userId;
        @AuraEnabled public String userName;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public Id locationId;
    }

    @AuraEnabled(cacheable=true)
    public static List<TerritoryNode> getTerritoryTree() {
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

        List<Territory2> territories = [
            SELECT Id, Name, ParentTerritory2Id
            FROM Territory2
            WHERE Territory2Model.State = 'Active'
            ORDER BY Name
        ];

        List<UserTerritory2Association> utas = [
            SELECT UserId, Territory2Id, User.Name, User.Profile.Name
            FROM UserTerritory2Association
            WHERE IsActive = true
              AND Territory2.Territory2Model.State = 'Active'
            ORDER BY User.Name
        ];

        Map<Id, List<TerritoryUser>> territoryUsersMap = new Map<Id, List<TerritoryUser>>();
        Set<String> seenUserTerritory = new Set<String>();
        for (UserTerritory2Association uta : utas) {
            String key = uta.Territory2Id + '-' + uta.UserId;
            if (seenUserTerritory.contains(key)) continue;
            seenUserTerritory.add(key);

            if (!territoryUsersMap.containsKey(uta.Territory2Id)) {
                territoryUsersMap.put(uta.Territory2Id, new List<TerritoryUser>());
            }
            TerritoryUser tu = new TerritoryUser();
            tu.userId = uta.UserId;
            tu.name = uta.User.Name;
            tu.profileName = uta.User.Profile.Name;
            tu.hasLocation = usersWithLocation.contains(uta.UserId);
            territoryUsersMap.get(uta.Territory2Id).add(tu);
        }

        List<TerritoryNode> results = new List<TerritoryNode>();
        for (Territory2 t : territories) {
            TerritoryNode node = new TerritoryNode();
            node.territoryId = t.Id;
            node.name = t.Name;
            node.parentTerritoryId = t.ParentTerritory2Id;
            node.users = territoryUsersMap.containsKey(t.Id)
                ? territoryUsersMap.get(t.Id)
                : new List<TerritoryUser>();
            results.add(node);
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
