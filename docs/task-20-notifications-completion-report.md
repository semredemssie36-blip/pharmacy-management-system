# TASK 20 — Notifications and User Alerts Completion Report

**Project:** EthioCodes Software Development PLC — Pharmacy Management System / Pharmacy ERP  
**Task:** 20 of the established implementation roadmap  
**Status:** Complete  
**Execution Boundary:** Task 20 only. Task 21 (Reports & Dashboards) has NOT been started.

---

## 1. Summary of Implemented Notification Capabilities

Task 20 delivers a comprehensive, permission-aware, multi-tier organization- and branch-scoped notification and alert system integrated directly into the core workflows of the Pharmacy ERP:

1. **Transactional In-App Notifications:** Real-time event notifications generated atomically within database transaction boundaries across business modules.
2. **Permission-Based Recipient Resolution:** Discovers eligible recipients matching required action permissions (e.g. `approval.discount`, `quarantine.view`, `stock_transfer.view`, `inventory.view`, `purchase_order.approve`) within the appropriate organization and branch boundaries.
3. **Segregation of Duties Enforcement:** Requesters of overrides and approvals are automatically excluded from receiving pending review notifications for their own requests.
4. **Targeted Recipient Notifications:** Direct notifications to initiating users upon decision events (approval granted, approval rejected, purchase order approved, refund completed).
5. **Event Deduplication & Idempotency:** Stable deduplication keys (`dedup_key`) backed by a database unique index prevent duplicate notifications across transaction retries and scheduled checks.
6. **Threshold & Expiry Scanning:** On-demand and periodic inventory & expiry threshold scan (`POST /api/v1/notifications/scan-alerts`) detecting low stock, stockouts, near-expiry batches (<=30 days), and expired stock with date-based deduplication to prevent flood.
7. **Frontend Notification Center:**
   - **Header Bell Indicator:** Unread count badge (with `99+` threshold), live polling every 30 seconds, and quick popover preview showing up to 5 recent notifications with relative timestamps and severity indicators.
   - **Notifications History Screen (`/notifications`):** Full dashboard with tabbed read/unread filtering, severity filtering, search, pagination, direct resource navigation, single-item mark read, and mark all read actions.

---

## 2. Existing Notification-Related Code Discovered and Reused

- **Data Scope & Authorization (`authorizationService.js`):** Reused `getUserScope(userId)` and scope resolution semantics (organization, branch, warehouse) to constrain notification querying and recipient eligibility.
- **Role-Permission Model (`user_roles`, `role_permissions`, `permissions`):** Reused `permissions` and role mappings for dynamic recipient discovery without hardcoded role names.
- **Transaction Connection Pattern (`getPool()`, `activeConn`):** Reused transactional connection propagation (`connection`) established in Task 18 & 19 to guarantee atomic commits/rollbacks between business mutations and notifications.
- **Frontend App Shell (`MainLayout.jsx`):** Integrated `NotificationBell` directly into the existing application header without redesigning unrelated UI.

---

## 3. Database Migrations and Tables

1. **`server/src/database/migrations/035_create_notifications.sql`**:
   - Table `notifications`:
     - `id`: BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
     - `organization_id`: INT UNSIGNED NOT NULL (FK to `organizations`)
     - `branch_id`: INT UNSIGNED NULL (FK to `branches`, ON DELETE SET NULL)
     - `warehouse_id`: INT UNSIGNED NULL (FK to `warehouses`, ON DELETE SET NULL)
     - `user_id`: INT UNSIGNED NOT NULL (FK to `users`, recipient, ON DELETE CASCADE)
     - `type`: VARCHAR(80) NOT NULL (e.g., `approval_pending`, `approval_decision`, `quarantine_alert`, `recall_alert`, `transfer_in_transit`, `transfer_discrepancy`, `stock_adjustment`, `stock_low`, `stock_out`, `batch_near_expiry`, `batch_expired`, `purchase_order_pending`, `purchase_order_decision`, `refund_processed`, `security_alert`)
     - `title`: VARCHAR(200) NOT NULL
     - `message`: TEXT NOT NULL
     - `severity`: ENUM('info', 'warning', 'danger', 'success') NOT NULL DEFAULT 'info'
     - `resource_type`: VARCHAR(80) NULL
     - `resource_id`: BIGINT UNSIGNED NULL
     - `resource_reference`: VARCHAR(100) NULL
     - `action_url`: VARCHAR(255) NULL
     - `is_read`: TINYINT(1) NOT NULL DEFAULT 0
     - `read_at`: TIMESTAMP NULL
     - `dedup_key`: VARCHAR(191) NULL
     - `created_at`: TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   - **Indexes:**
     - `UNIQUE KEY uq_notif_dedup (dedup_key)`
     - `KEY idx_notif_user_read (user_id, is_read, created_at)`
     - `KEY idx_notif_user_created (user_id, created_at)`
     - `KEY idx_notif_org (organization_id, created_at)`
     - `KEY idx_notif_branch (branch_id, created_at)`
     - `KEY idx_notif_resource (resource_type, resource_id)`

2. **`server/src/database/migrations/036_seed_notification_permissions.sql`**:
   - Permission ID 180: `notification.view` ('administration', 'notification', 'view', 'View notifications, alerts, and system announcements')
   - Granted to `SYSTEM_ADMINISTRATOR` role.

---

## 4. Backend Components Created & Modified

### Created:
- **`server/src/repositories/notificationRepository.js`**: Data access layer supporting single and bulk notification inserts with `ON DUPLICATE KEY UPDATE` idempotency, index-optimized unread counts, user-scoped paginated queries, mark-read mutations, and dynamic user discovery by permission code and data scope.
- **`server/src/services/notificationService.js`**: Core business service handling input sanitization (redacting passwords, tokens, card numbers, stripping HTML), recipient resolution, transactional notifications, user-scoped notification reading, and inventory/expiry alert scanning.
- **`server/src/controllers/notificationController.js`**: Controller exposing `listNotifications`, `getUnreadCount`, `getNotificationById`, `markAsRead`, `markAllAsRead`, and `scanAlerts`.
- **`server/src/routes/notificationRoutes.js`**: Express router registering authenticated endpoints.

### Modified:
- **`server/src/routes/index.js`**: Mounted `notificationRoutes`.
- **`server/src/services/approvalService.js`**: Integrated notifications for approval creation (`approval_pending` with requester exclusion) and approval decisions (`approval_decision` approved/rejected for requester).
- **`server/src/services/quarantineService.js`**: Integrated `quarantine_alert` on quarantine hold creation.
- **`server/src/services/recallService.js`**: Integrated `recall_alert` on product recall activation.
- **`server/src/services/stockTransferService.js`**: Integrated `transfer_in_transit` upon dispatch and `transfer_discrepancy` upon receipt variances.
- **`server/src/services/stockCountService.js`**: Integrated `stock_adjustment` notification when variance adjustments are finalized.
- **`server/src/procurement/purchaseOrderService.js`**: Integrated `purchase_order_pending` upon submit and `purchase_order_decision` upon approval/rejection.
- **`server/src/services/paymentService.js`**: Integrated `refund_processed` notification upon customer payment refunds.
- **`server/src/services/authService.js`**: Integrated `security_alert` on failed password authentication.

---

## 5. Frontend Components Created & Modified

### Created:
- **`client/src/components/NotificationBell.jsx`**: Header notification bell trigger with unread badge counter (`99+` display), click-outside and escape-key handling, polling every 30 seconds, quick popover listing latest 5 items, relative timestamps, severity badges, and quick mark-read actions.
- **`client/src/pages/NotificationsPage.jsx`**: Notification History page supporting tabbed filtering (All / Unread / Read), severity dropdown, text search, paginated cards, direct resource navigation, and on-demand alert scanning.
- **`client/src/test/notificationsPage.test.jsx`**: Frontend Vitest test suite for `NotificationBell` and `NotificationsPage`.

### Modified:
- **`client/src/layouts/MainLayout.jsx`**: Embedded `NotificationBell` in the header bar and added "Notifications" navigation link in the sidebar.
- **`client/src/routes/router.jsx`**: Registered `/notifications` route for `NotificationsPage`.

---

## 6. Real Business Workflows Integrated

| Business Workflow | Trigger Event | Notification Type | Severity | Recipient Resolution |
|---|---|---|---|---|
| **Approvals** | Approval request submitted | `approval_pending` | `warning` | Users with policy `required_permission` in org/branch; excludes requester |
| **Approvals** | Approval request approved | `approval_decision` | `success` | Direct to request requester |
| **Approvals** | Approval request rejected | `approval_decision` | `danger` | Direct to request requester |
| **Quarantine** | Stock placed on quarantine hold | `quarantine_alert` | `danger` | Users with `quarantine.view` in org/branch |
| **Recalls** | Product recall activated | `recall_alert` | `danger` | Users with `recall.view` in organization |
| **Stock Transfers** | Transfer dispatched | `transfer_in_transit` | `info` | Users with `stock_transfer.view` in destination branch |
| **Stock Transfers** | Transfer received with discrepancy | `transfer_discrepancy` | `warning` | Users with `stock_transfer.view` in source branch |
| **Stock Counts** | Adjustments finalized with variance | `stock_adjustment` | `warning` | Users with `stock_count.view` in branch/org |
| **Procurement** | PO submitted for approval | `purchase_order_pending` | `warning` | Users with `purchase_order.approve` in org/branch |
| **Procurement** | PO approved or rejected | `purchase_order_decision` | `success`/`danger`| Direct to PO creator |
| **Finance** | Payment refund issued | `refund_processed` | `info` | Users with `payment.view` in branch/org |
| **Security** | Failed password login attempt | `security_alert` | `danger` | Direct to target account holder |
| **Threshold Scan** | Stock at or below reorder level | `stock_low` / `stock_out` | `warning`/`danger` | Users with `inventory.view` in branch/org |
| **Threshold Scan** | Batch expired or expiring in <= 30d | `batch_near_expiry` / `batch_expired` | `warning`/`danger` | Users with `inventory.view` in branch/org |

---

## 7. Recipient-Resolution and Scope Behavior

- Recipient resolution does not use hardcoded role names; it queries users whose active roles contain the required permission (`permissions.code = ?`).
- Users must be active (`users.status = 'active'`).
- Scope matching adheres strictly to repository lineage:
  - Users with organization scope (`user_scopes.scope_type = 'organization'`) receive notifications for any branch within that organization.
  - Users with branch scope (`user_scopes.scope_type = 'branch'`) only receive notifications targeted to their assigned branch.
  - Requesters of an approval are explicitly filtered out (`excludeUserIds`) to maintain segregation of duties.

---

## 8. Deduplication and Transaction Consistency

- **Transaction Atomicity:** When notifications are created inside a business operation (`connection` provided), the notification row is written inside the caller's MariaDB transaction. If the business operation rolls back, all associated notifications roll back with it.
- **Deduplication:** Uses `dedup_key VARCHAR(191) UNIQUE`. Attempting to insert a duplicate event updates the existing ID without duplicate row generation.
- **Scheduled Flood Protection:** Threshold scans generate dedup keys keyed by `${resource}:${id}:${date}`, guaranteeing that scanning multiple times on the same day never floods users with duplicate notifications.

---

## 9. Security and Privacy Protections

- **Data Scrubbing:** `sanitizeText` scrubs sensitive terms (passwords, tokens, bearer secrets, credit cards, CVVs, PINs) and strips HTML tags to eliminate XSS risks.
- **Resource Privacy:** Notification messages avoid exposing confidential clinical or financial details.
- **Strict User Ownership:** Every query on `/notifications/:id` and `/notifications/:id/read` filters strictly by `user_id = ?`. Users cannot read, enumerate, or mark notifications belonging to other users (returns 404).
- **Immutability of Audit vs Read States:** Notifications are not business audit records. Users can only mutate `is_read` and `read_at`.

---

## 10. Automated Tests Summary

### Backend Tests (`server/tests/notifications.test.js`):
- **Core Service & Sanitization (6 tests):**
  - Sanitization of credentials, card numbers, pins, and HTML tags: **PASS**
  - Parameter validation on notification creation: **PASS**
  - Notification creation with properties and defaults: **PASS**
  - Deduplication key enforcement: **PASS**
  - Recipient resolution by permission & scope: **PASS**
  - Transaction rollback consistency (no ghost notification on business failure): **PASS**
- **API Security & Ownership (4 tests):**
  - 401 unauthenticated access rejection: **PASS**
  - User notification query and unread count: **PASS**
  - User A cannot access or mark User B notification as read (404 isolation): **PASS**
  - Single read and mark-all-read mutations: **PASS**
- **Workflow Integrations (3 tests):**
  - Approval request creation and decision notifications: **PASS**
  - Quarantine hold creation notification: **PASS**
  - Inventory & expiry alert scanning without duplicate flood: **PASS**

**Result: 13 tests passed, 0 failed, 0 skipped.**

### Frontend Tests (`client/src/test/notificationsPage.test.jsx`):
- NotificationBell unread badge rendering and popover toggle: **PASS**
- NotificationBell single mark-as-read: **PASS**
- NotificationsPage filter toolbar and list rendering: **PASS**
- NotificationsPage mark-as-read action: **PASS**
- NotificationsPage scan-alerts action: **PASS**

**Result: 5 tests passed, 0 failed, 0 skipped.**

---

## 11. Regression Tests Results

Executed all existing test suites across the repository:
- `server/tests/audit.test.js`: **14 passed, 0 failed**
- `server/tests/approvals.test.js`: **8 passed, 0 failed**
- `server/tests/quarantineExpiryRecall.test.js`: **8 passed, 0 failed**
- `server/tests/stockTransfers.test.js`: **7 passed, 0 failed**
- `server/tests/stockCounts.test.js`: **8 passed, 0 failed**
- `server/tests/auth.test.js`: **10 passed, 0 failed**
- Full client Vitest suite (`client/src/test/*.test.jsx`): **20 test files passed, 78 tests passed, 0 failed**

---

## 12. Production Build and API Health Check

1. **Frontend Production Build:**
   ```bash
   npm run build
   ```
   Output: `✓ built in 5.32s` with 0 errors.

2. **Backend API Health Check:**
   `GET /api/v1/health` returned HTTP 200:
   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "service": "pharmacy-erp-server"
     }
   }
   ```

---

## 13. Limitations and Deferred Items

- **SMS / Email Delivery:** Explicitly out of scope for Task 20. The current implementation provides a reliable in-app Notification Center baseline. External notification transports can be plugged into `notificationService.notifyUsers` if required in future infrastructure tasks.
- **WebSockets / Server-Sent Events:** Periodic lightweight polling (30s) is used to avoid external dependencies or stateful socket connections, maintaining full architectural compatibility.

---

## 14. Confirmation

**Task 20 is complete.**  
**Task 21 (Reports and Dashboards) has NOT been started.**
