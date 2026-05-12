# Admin Zone / Map Usage

## Current Status

Admin frontend zone and map usage has been removed from the active pages that were still depending on it.

## Removed From Admin Frontend

1. `Frontend/src/modules/Food/pages/admin/AdminHome.jsx`
   - zone filter removed

2. `Frontend/src/modules/Food/pages/admin/reports/TransactionReport.jsx`
   - zone filter removed
   - zone fetch removed

3. `Frontend/src/modules/Food/pages/admin/reports/RestaurantReport.jsx`
   - zone filter removed
   - zone fetch removed

4. `Frontend/src/modules/Food/pages/admin/reports/RegularOrderReport.jsx`
   - zone filter removed
   - zone fetch removed

5. `Frontend/src/modules/Food/pages/admin/OrderDetectDelivery.jsx`
   - zone filter removed
   - zone list fetch removed
   - zone column hidden by default

6. `Frontend/src/modules/Food/pages/admin/categories/Category.jsx`
   - dead zone loading removed
   - category save stays global/manual

7. `Frontend/src/modules/Food/pages/admin/restaurant/AddRestaurant.jsx`
   - zone select removed earlier
   - manual address required

8. `Frontend/src/modules/Food/pages/admin/restaurant/EditRestaurant.jsx`
   - zone select removed earlier
   - manual address required

9. `Frontend/src/modules/Food/pages/admin/restaurant/RestaurantsList.jsx`
   - restaurant location editor changed to manual address entry
   - zone select removed
   - Google location search removed

10. `Frontend/src/modules/Food/pages/admin/restaurant/ZoneSetup.jsx`
    - removed

11. `Frontend/src/modules/Food/pages/admin/restaurant/AllZonesMap.jsx`
    - removed

12. `Frontend/src/modules/Food/pages/admin/restaurant/ViewZone.jsx`
    - removed

13. `Frontend/src/modules/Food/pages/admin/restaurant/AddZone.jsx`
    - removed

14. `Frontend/src/modules/Food/pages/admin/delivery-partners/DeliverymanList.jsx`
    - zone assignment UI removed earlier

15. `Frontend/src/modules/Food/pages/admin/system/AdminManagement.jsx`
    - zone assignment removed earlier

16. `Frontend/src/modules/Food/components/admin/orders/AssignDeliveryPartnerDialog.jsx`
    - zone-based filtering removed earlier

## Removed From Admin Routing / Permissions

1. `Backend/src/modules/food/admin/routes/admin.routes.js`
   - admin zone CRUD routes removed
   - delivery partner zone update route removed

2. `Backend/src/modules/food/admin/constants/adminPermissions.js`
   - `ZONE_SETUP` permission removed
   - zone route permission mapping removed

## Remaining Notes

Backend still contains older zone-aware service/model logic for broader admin, restaurant, category, and reporting internals.
That logic is not directly wired to the removed admin zone pages/routes listed above.

- Banners.jsx: zone field/column and Zone wise option removed
- delivery-partners/AddDeliveryman.jsx: zone requirement/input removed
- OrderDetectDelivery.jsx + OrderDetectDeliveryTable.jsx: zone data/column/search removed
- `employees/AddEmployee.jsx` + `employees/EmployeeRole.jsx`: zone field/permission removed
- `settings/SubscriberList.jsx`: dead zone filter removed
- `restaurant/RestaurantsBulkImport.jsx`: zone import instruction removed
- `system/ThirdParty.jsx`: Google Maps service entry removed
- `system/CleanDatabase.jsx`: `Zones` table entry removed from admin mock list
- `system/JoinUsPageSetup.jsx`: zone/map default onboarding fields removed
- `system/LandingPageSettings.jsx`: available-zone tabs/sections removed

## 2026-05-12 Cleanup Pass
- Removed remaining admin category zoneId placeholders from frontend and backend category schema/validator.
- Removed admin auth zoneIds metadata from dmin.model.js and dmin.routes.js.
- Removed dead admin controller handlers for zone CRUD and delivery-partner zone assignment.
- Removed admin order dialog Google Maps link and coordinate display from Frontend/src/modules/Food/components/admin/orders/ViewOrderDialog.jsx.
- Simplified active admin service zone guards for admin creation/category flows and removed zone CRUD service exports.
- Remaining admin frontend zone text is limited to redirect-only legacy zone-setup* routes in AdminRouter.jsx.
- Remaining backend zone references are inside legacy admin reporting/search/service compatibility branches in Backend/src/modules/food/admin/services/admin.service.js.
