# Task 21 Completion Report — Reports and Dashboards

**Project:** EthioCodes Software Development PLC — Pharmacy Management System / Pharmacy ERP  
**Task:** 21 of the established 24-task implementation roadmap  
**Task Name:** Reports and Dashboards  
**Execution Boundary:** Task 21 only. Task 22 (Search, Import and Export) has NOT been started.

---

## 1. Executive Summary

Task 21 delivers an authoritative, permission-aware, organization-, branch-, and warehouse-scoped reporting and dashboard module for the Pharmacy ERP.

The reporting module operates with zero estimates or fictitious statistics: all numbers, cards, breakdowns, and ledgers calculate strictly from verified transactional records in MariaDB (`sales`, `sale_lines`, `payments`, `customer_receivables`, `refunds`, `inventory`, `batches`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `prescriptions`, `dispensings`, `quarantine_cases`, `recall_cases`, and `approval_requests`).

Reports are strictly read-only and immutable. Viewing or querying reports never alters stock quantities, payment allocations, approval states, or clinical records.

---

## 2. Reused Reporting Code and Authoritative Data Sources

The reporting module integrates with existing database tables and repositories without modifying business rules:

| Domain | Authoritative Data Tables | Fields Used & Calculation Method | Excluded Data / Invariants |
| :--- | :--- | :--- | :--- |
| **Sales** | `sales`, `sale_lines`, `products`, `branches`, `customers` | `subtotal`, `discount_amount`, `total_amount`, `paid_amount`, `payment_status`. Count of completed sales. | Excludes `draft`, `cancelled`, and `voided` sales from completed revenue totals. |
| **Payments** | `payments` | `amount`, `payment_method`, `payment_date`. Count of transactions. | Excludes failed or cancelled payments (`status = 'completed'`). Split payments and allocations are not duplicated. |
| **Receivables** | `customer_receivables`, `customers` | `total_amount`, `paid_amount`, `balance_amount`, `due_date`, `status`. Active balance equals sum of balance amounts for `unpaid` and `partially_paid`. | Cancelled receivables are excluded. |
| **Refunds** | `refunds` | `amount`, `created_at`, `status`. | Refunds are separate from sales deductions and do not alter stock balances. |
| **Inventory** | `inventory`, `batches`, `products`, `warehouses`, `storage_locations` | `quantity` grouped by `status` (`available`, `reserved`, `quarantined`, `expired`, `damaged`). | Available stock ≠ Physical stock. Segregated expired/quarantined units are never reported as available. |
| **Stock Valuation** | `purchase_order_lines`, `purchase_orders` | Valuation uses latest confirmed purchase price from `fully_received` purchase orders. | Where no historical purchase cost exists, valuation basis is reported as `N/A`. |
| **Procurement** | `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `suppliers` | `ordered_quantity` vs `received_quantity` from goods receipts. Fulfillment percentage computed per PO. | PO spend excludes cancelled orders. Approved POs are never assumed to be in stock until goods receipts confirm delivery. |
| **Clinical Dispensing** | `prescriptions`, `dispensings`, `dispensing_lines`, `patients` | `prescriptions.status`, `dispensings.status`, `dispensing_lines.dispensed_quantity`, `dispensings.total_amount`. | Clinical notes and diagnoses are aggregated safely without exposing unneeded clinical details. |
| **Exceptions & Risk** | `batches`, `inventory`, `quarantine_cases`, `recall_cases` | `batches.expiry_date`, `quarantine_cases.quantity`, `recall_cases.severity`. | Expiry horizon dynamically filtered (≤ 30, 60, 90, 180, 365 days). |

---

## 3. Database Migrations and Permissions Seeded

### Migration `037_seed_report_permissions.sql`
Seeded permissions into `permissions` table and assigned to `SYSTEM_ADMINISTRATOR` (Role ID 1):
- `181` — `report.dashboard.view` (`reporting`, `dashboard`, `view`): View operational dashboards and summary KPIs.
- `182` — `report.sales.view` (`reporting`, `sales_report`, `view`): View sales performance and revenue reports.
- `183` — `report.inventory.view` (`reporting`, `inventory_report`, `view`): View inventory balances, stock positions, and movement reports.
- `184` — `report.financial.view` (`reporting`, `financial_report`, `view`): View collections, receivables, and financial summary reports.
- `185` — `report.procurement.view` (`reporting`, `procurement_report`, `view`): View purchase order fulfillment and supplier receiving reports.
- `186` — `report.dispensing.view` (`reporting`, `dispensing_report`, `view`): View prescription and dispensing operational reports.
- `187` — `report.expiry_quarantine.view` (`reporting`, `expiry_report`, `view`): View expiry alerts, quarantine holds, and recall reports.

Applied and verified on both development (`pharmacy_erp`) and test (`pharmacy_erp_test`) databases.

---

## 4. Backend Implementation

Followed strict architecture: `Route → Controller → Service → Repository → Database Pool`.

### 1. `server/src/repositories/reportRepository.js`
- **`getDashboardSummary({ organizationId, branchIds, warehouseId, startDate, endDate })`**: Aggregates sales metrics, payment collections, outstanding receivables, inventory balance by status, low stock/stockout counts, near-expiry batch counts, workflow counts (approvals, transfers, quarantines, recalls, prescriptions), recent completed sales, and imminent batch expiries.
- **`getSalesReport({ organizationId, branchIds, startDate, endDate, productId, categoryId, paymentStatus, page, limit })`**: Computes gross sales, discounts, net sales, paid sales, daily sales trend, sales breakdown by branch, top products sold, and paginated transaction ledger.
- **`getInventoryReport({ organizationId, branchIds, warehouseId, categoryId, status, isLowStock, page, limit })`**: Computes available vs reserved vs quarantined vs expired quantities, stock by category and warehouse, and paginated inventory positions with latest PO cost basis and estimated valuation.
- **`getFinancialReport({ organizationId, branchIds, startDate, endDate, paymentMethod, page, limit })`**: Computes gross collections, refunds, net collections, customer credit extended, outstanding receivables balance, collections by payment method (cash, card, bank transfer, mobile money), and customer receivables ledger.
- **`getProcurementReport({ organizationId, branchIds, supplierId, status, startDate, endDate, page, limit })`**: Computes PO total spend, order count by lifecycle status, goods receipts count, discrepancy receipts count, spend by supplier, and paginated ordered-vs-received fulfillment rates.
- **`getDispensingReport({ organizationId, branchIds, startDate, endDate, page, limit })`**: Computes prescription intake lifecycle breakdown, dispensing execution breakdown, dispensing revenue, top dispensed products, and paginated dispensings list.
- **`getExpiryQuarantineReport({ organizationId, branchIds, warehouseId, daysThreshold, page, limit })`**: Computes expiring/expired batches list with days remaining, active quarantine holds list with quantities and reasons, and active recall notices list.

### 2. `server/src/services/reportService.js`
- **Scope resolution (`resolveScopedFilters`)**: Enforces multi-tier RBAC data isolation. Inspects `authorizationService.getUserScope(user.id)`. Branch-scoped users are restricted to their authorized branches; attempting to query an out-of-scope `branchId` or `organizationId` throws `403 Forbidden` (`SCOPE_FORBIDDEN`).
- **Date boundary normalization (`normalizeDateRange`)**: Validates ISO date formats (`YYYY-MM-DD`). Rejects inverted date ranges (`startDate > endDate`) with `400 Bad Request`. Automatically bounds time boundaries to `00:00:00` and `23:59:59` to prevent off-by-one errors on datetime columns (`sale_date`, `payment_date`).
- **Pagination bounds**: Sanitizes page numbers ($\ge 1$) and limits ($1 \le limit \le 100$).

### 3. `server/src/controllers/reportController.js`
Thin controller layer mapping HTTP requests to service calls with consistent JSON response envelopes:
- `getDashboardSummary`
- `getSalesReport`
- `getInventoryReport`
- `getFinancialReport`
- `getProcurementReport`
- `getDispensingReport`
- `getExpiryQuarantineReport`

### 4. `server/src/routes/reportRoutes.js`
Mounted under `/api/v1/reports`:
- `GET /reports/dashboard` — requires `report.dashboard.view`
- `GET /reports/sales` — requires `report.sales.view`
- `GET /reports/inventory` — requires `report.inventory.view`
- `GET /reports/financial` — requires `report.financial.view`
- `GET /reports/procurement` — requires `report.procurement.view`
- `GET /reports/dispensing` — requires `report.dispensing.view`
- `GET /reports/expiry-quarantine` — requires `report.expiry_quarantine.view`

Mounted in `server/src/routes/index.js`.

---

## 5. Frontend Implementation

### 1. `client/src/features/reports/api.js`
Reusable API client wrapping all `/reports/*` endpoints via `apiClient` with proper query string serialization.

### 2. `client/src/pages/DashboardOverviewPage.jsx` (`/dashboard`)
Interactive operational dashboard featuring:
- **Date preset controls:** "Today", "7 Days", "30 Days", "This Month", and custom date pickers.
- **Summary KPI Cards:**
  - Completed Sales Revenue & Completed Transaction Count.
  - Cash & Digital Collections & Net Realization.
  - Customer Accounts Receivable & Open Credit Accounts.
  - Available Inventory Units vs Physical Stock.
- **Operational Alerts Grid:**
  - Low Stock & Stockout Counts.
  - Expiry Risks ($\le 90$ days vs Expired).
  - Pending Administrative Approvals.
  - Active Quarantine Holds & Product Recalls.
- **Visual Breakdown Bars:**
  - Financial Flow Realization (Sales vs Collections vs Outstanding Credit).
  - Inventory Balance Segregation (Available vs Quarantined vs Expired).
- **Recent Activity Tables:**
  - Recent Completed Sales with customer, branch, and payment status badges.
  - Imminent Batch Expiries with days remaining and available units.
- **Quick Navigation Cards:** Jump links to specific report categories.

### 3. `client/src/pages/ReportsPage.jsx` (`/reports`)
Comprehensive tabbed reporting interface supporting:
- Tabbed switching: Sales, Inventory, Finance, Procurement, Dispensing, Expiry/Quarantine.
- URL search param synchronization (`/reports?tab=...`).
- Granular filter controls (Dates, Payment Status, Stock Status, Low Stock toggle, PO Status, Expiry Horizon).
- Reset and Apply filter controls.
- Aggregated summary cards per tab.
- Detailed paginated data tables with column alignment, numeric formatting, and status badges.
- Loading skeletons and empty states.

### 4. Layout & Navigation Integration
- Updated `client/src/routes/router.jsx` to register `/dashboard` and `/reports` as protected routes.
- Updated `client/src/layouts/MainLayout.jsx` sidebar to include:
  - "Dashboard" (gated by `report.dashboard.view`)
  - "Reports & Analytics" (gated by `report.sales.view`)

---

## 6. Organization, Branch, and Warehouse Scope Behavior

1. **Organization Isolation:** Every query enforces `WHERE organization_id = ?`. Users belonging to Organization A never receive data belonging to Organization B.
2. **Branch Scope Isolation:**
   - Users with branch scope are restricted to `branch_id IN (authorized_branches)`.
   - In cross-branch views (e.g. Org Admin), branch filters are optional.
   - For branch-scoped users, providing an out-of-scope `branchId` in the query returns `403 Forbidden` (`SCOPE_FORBIDDEN`).
3. **Warehouse Scope Isolation:**
   - Inventory reports and stock summary KPIs enforce warehouse restrictions when requested or when user is warehouse-scoped.
4. **Multi-Table Joins:**
   - In multi-table joins (e.g., `sales` joined with `sale_lines`, `products`, `branches`), branch conditions are pinned to the primary entity to prevent cross-branch leaks.

---

## 7. Query Validation and Performance Measures

- **Parameterized Queries:** 100% of repository queries use parameterized placeholders (`?`). String concatenation of raw user input into SQL is strictly prohibited.
- **Date Boundary Safety:** Explicit date strings formatted as `YYYY-MM-DD 00:00:00` and `YYYY-MM-DD 23:59:59` to eliminate off-by-one datetime errors.
- **Inverted Range Prevention:** Validation immediately rejects queries where `startDate > endDate`.
- **Bounded Pagination:** All listing endpoints enforce `limit` between 1 and 100 (default 20/15) with calculated offsets to avoid unbounded result sets.
- **Elimination of Join Multiplication:** Subqueries and distinct counts (`COUNT(DISTINCT s.id)`) are used to prevent cartesian explosion when joining orders, line items, and allocations.

---

## 8. Automated Testing Results

### Backend Integration Tests (`server/tests/reports.test.js`)
All 14 integration tests passed:
- `✔ 1. Unauthenticated requests to report endpoints return 401`
- `✔ 2. User lacking reporting permissions receives 403 Forbidden`
- `✔ 3. Admin user with full report permissions accesses dashboard overview successfully`
- `✔ 4. Branch-scoped user only sees Branch 1 data, never Branch 2 data`
- `✔ 5. Branch-scoped user querying out-of-scope branchId receives 403 Forbidden`
- `✔ 6. User querying out-of-scope organizationId receives 403 Forbidden`
- `✔ 7. Date validation: inverted date range (startDate > endDate) returns 400`
- `✔ 8. Date validation: malformed date string returns 400`
- `✔ 9. Sales report excludes draft transactions from completed totals`
- `✔ 10. Financial report returns collections by method and outstanding receivables`
- `✔ 11. Inventory report returns physical vs available quantities and batch valuation`
- `✔ 12. Procurement report returns purchase order fulfillments and spend`
- `✔ 13. Expiry and Quarantine exceptions report returns near-expiry batches and active holds`
- `✔ 14. Multi-organization isolation: Org 2 user sees zero Org 1 sales`

**Total Backend Report Tests:** 14 passed, 0 failed, 0 skipped.

### Frontend Component Tests (`client/src/test/reportsPages.test.jsx`)
All 6 frontend tests passed:
- `✔ DashboardOverviewPage > renders operational dashboard heading and key metrics cards`
- `✔ DashboardOverviewPage > renders alert counts and recent tables`
- `✔ DashboardOverviewPage > allows clicking date preset filters`
- `✔ ReportsPage > renders report navigation tabs and sales summary cards`
- `✔ ReportsPage > switches to inventory tab and displays inventory positions with valuation`
- `✔ ReportsPage > switches to expiry tab and displays near expiry batches`

**Total Frontend Test Suite:** 21 test files, 84 tests passed, 0 failed.

### Regression Test Suite
Executed the core regression suites:
- `auth.test.js`: Passed
- `sales.test.js`: 23 passed, 0 failed
- `inventory.test.js`: 25 passed, 0 failed
- `payments.test.js`: 11 passed, 0 failed
- `products.test.js`: 20 passed, 0 failed
- `audit.test.js`, `notifications.test.js`, `quarantineExpiryRecalls.test.js`: 53 passed, 0 failed

---

## 9. Build and Health Check Verification

- **Client Production Build (`npm run build`):** Vite v5.4.21 transformed 129 modules and bundled cleanly in 5.33 seconds (`dist/index.html`, `dist/assets/index-BKVZHo9K.js`, `dist/assets/index-B-2PQlkJ.css`).
- **Backend Health Check (`GET /api/v1/health`):** Returned HTTP 200 `{ success: true, data: { status: 'ok', service: 'pharmacy-erp-server' } }`.

---

## 10. Known Limitations and Unsupported Metrics

1. **FIFO / Weighted-Average Costing Engine:**
   - The database does not yet contain a general-ledger double-entry accounting engine. Inventory valuation is defensibly estimated from the latest confirmed purchase order unit price.
2. **General-Purpose Export Framework:**
   - In accordance with the Task 21 specification and Task 22 boundary, a general-purpose CSV/Excel export framework belongs to Task 22 (Search, Import and Export). Reports currently render complete in-app interactive ledgers and summary views.

---

## 11. Strict Execution Boundary Confirmation

**Task 21 is complete.**  
**Task 22 (Search, Import and Export) has NOT been started.**
