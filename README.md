# Pharmacy ERP

Multi-Branch Pharmacy Management / ERP System for EthioCodes Software Development PLC.

> This repository currently contains **TASK 01 — Project Foundation** only.
> Business modules (POS, sales, prescriptions, inventory transactions, etc.)
> are implemented in later tasks. The authoritative specification lives in
> `docs/stage-01` … `docs/stage-10`.

## Purpose

Provide the technical foundation (frontend app, backend API, database
configuration, error handling, environment setup) on which all later
pharmacy ERP modules will be built.

## Architecture

```
React (Vite + Tailwind + React Router)
        │  REST over HTTP (/api)
        ▼
Node.js / Express backend  →  Route → Controller → Service → Repository → MySQL
```

- `client/` — React frontend (Vite, Tailwind CSS, React Router)
- `server/` — Express backend (config, middleware, routes, controllers,
  services, repositories, database pool, centralized error handling)
- `docs/` — stage specifications (source of truth)
- `scripts/` — development helper scripts

## Prerequisites

- Node.js 20+ and npm 10+
- MySQL 8+ (database schema is added in later tasks; the connection layer
  is ready)

## Environment configuration

Copy the example files and adjust values. **Never commit real secrets.**

```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

`server/.env`:

| Variable             | Description                        |
| -------------------- | ---------------------------------- |
| NODE_ENV             | development / test / production    |
| PORT                 | API port (default 5000)            |
| CLIENT_URL           | Allowed CORS origin                |
| DATABASE_HOST        | MySQL host                         |
| DATABASE_PORT        | MySQL port                         |
| DATABASE_NAME        | Database name                      |
| DATABASE_USER        | Database user                      |
| DATABASE_PASSWORD    | Database password                  |
| JWT_SECRET           | JWT signing secret (required in prod) |
| JWT_EXPIRES_IN       | Session lifetime (e.g. 8h)         |
| AUTH_COOKIE_NAME     | Auth cookie name                   |
| AUTH_COOKIE_SAME_SITE| Cookie SameSite policy             |
| AUTH_COOKIE_SECURE   | true in production (HTTPS)         |

`client/.env`:

| Variable            | Description                              |
| ------------------- | ---------------------------------------- |
| VITE_API_BASE_URL   | Backend API base URL (…/api)             |

## Install dependencies

```bash
npm run install:all
```

## Start the backend

```bash
npm run dev:server      # nodemon, http://localhost:5000
```

## Start the frontend

```bash
npm run dev:client      # Vite dev server, http://localhost:5173
```

The Vite dev server proxies `/api` to the backend on port 5000, so
frontend-to-backend configuration works out of the box.

## API versioning + endpoint overview

All backend endpoints are versioned under `/api/v1/...` (e.g.
`/api/v1/health`, `/api/v1/auth/login`, `/api/v1/organizations`). Business
endpoints follow the existing Route → Controller → Service → Repository → DB
layering with authentication, permission (`requirePermission`) and organization
scope enforcement on every handler.

**Decisions recorded:**
- `/api/v1/` was chosen as the single versioning convention (Stage-09 recommended
  this; Tasks 01–02 used unversioned `/api/...` and were updated to match).
- Local development runs on the XAMPP-bundled MariaDB (MySQL-compatible,
  root user with an empty password). Credentials live only in `server/.env`
  (gitignored); no secrets are committed.
- The dev seed account only has local-testing privileges; new users must be
  explicitly granted roles and scopes through the admin UI/API.

## Organization structure (Task 03)

Entities and relationships (enforced with foreign keys):

```
organizations (id, name, code UNIQUE, status, created_at, updated_at)
    └── branches (id, organization_id FK, name, code UNIQUE per org, status, ...)
        └── warehouses (id, branch_id FK, name, code UNIQUE per branch, status, ...)
            └── storage_locations (id, warehouse_id FK, name, code UNIQUE per warehouse,
                                    storage_condition: normal|refrigerated|controlled, status, ...)
```

- Uniqueness: organization code globally; branch code within its organization;
  warehouse code within its branch; storage-location code within its warehouse.
- Creating a branch/warehouse/location under an **inactive** parent is rejected (`409 INACTIVE_PARENT`).
- Records are deactivated (`active`/`inactive`), not physically deleted, to preserve history.

Endpoints (all require authentication):

- `GET/POST /api/v1/organizations`, `GET/PATCH /api/v1/organizations/:id`, `POST /api/v1/organizations/:id/deactivate`
- Same shape for `/api/v1/branches`, `/api/v1/warehouses`, `/api/v1/storage-locations`.
- List endpoints accept filters: `/api/v1/branches?organizationId=…`, `/api/v1/warehouses?branchId=…`, `/api/v1/storage-locations?warehouseId=…`.

Frontend pages (protected): `/administration/organizations`, `/administration/branches`,
`/administration/warehouses`, `/administration/storage-locations`.

Development seed (optional, local testing only — NOT production data):

```bash
npm --prefix server run seed:organization
# creates "Example Pharmacy (Development)" org / main branch / warehouse / sample locations
```

## Procurement — Purchase Orders (Task 08)

Backend exposes `/api/v1/purchase-orders` (+ `:id` PATCH/GET, `submit`, `approve`,
`reject`, `cancel`). Lines live in `purchase_order_lines` and are editable only
while the PO is a **draft**. Submitted (after Submit → pending_approval) POs are
immutable except for Cancel/Reject. Status machine:
`draft → pending_approval → approved → partially_received → fully_received`,
with `rejected`/`cancelled` alternatives from `pending_approval`/`approved`
(cancel requires a reason; rejection requires a reason). `purchase_order.approve`
gates approve/reject.

Totals are recomputed server-side from `quantity × unit_price`; the client never
sets `total_amount`. Stock was intentionally NOT touched in tests: PO create /
update / submit / approve leaves `inventory` and `stock_movements` unchanged
(procurement/goods-receiving belongs to Task 09).

## Suppliers & Customers (Task 07)

Two organization-level master-data resources, separate from manufacturers/products:
`suppliers` (code, name, contact_person, telephone, email, address, country,
tax_registration_number, notes, status) and `customers` (code, name,
customer_type `individual|business|institution`, telephone, email, address,
territory, pricing_tier, credit_limit ≥ 0, payment_terms, notes, status), each
with `(organization_id, code)` unique.

Endpoints (auth + permission + org-scope enforced): list/get/create/patch/deactivate/
activate for `/api/v1/suppliers` and `/api/v1/customers`. Permissions seeded:
`supplier.view/create/update/deactivate`, `customer.view/create/update/deactivate`,
granted to the bootstrap System Administrator role.

Manufacturer ≠ Supplier; Customer ≠ Patient; and customer `credit_limit` is a
**policy value** — no receivables, credit transactions, payment allocations,
POS, or customer payments are implemented here. No inventory quantities are
affected by supplier/customer CRUD.

Frontend: new "Partners" section with Suppliers and Customers admin pages built
on the shared `AdminDirectoryPage` (search/status filter/actions + permission
gates).

## Inventory Foundation (Task 06)

```
organization
  └── branch
      └── warehouse
          └── storage_location
product ─┬─ batch(expiry per batch)
         └─ inventory (per org/branch/warehouse/location/product/batch/unit/status)
                └── stock_movements (append-only ledger, per quantity change)
```

- **Inventory is never a `quantity` column on a product.** It is one row per
  physical stock position with a typed unit (from Product Master), a batch, an
  expiry date, and a stock status: `available`, `reserved`, `quarantined`,
  `damaged`, `expired`, `recalled`, `returned`, `awaiting_disposal`, `disposed`.
  *Physical stock* is the aggregate; *available* stock is only the rows whose
  status is `available` — the opinion is enforced at the service layer.
- **Batches** belong to a product and organization with a
  `(organization_id, product_id, batch_number)` unique key; different batches of
  the same product can hold different expiry dates (FEFO data preserved for
  the future POS/dispensing consumption).
- **Stock movements** are append-only records (type, product, batch, location,
  unit, signed delta, reference type/id, reason, actor, timestamp). They are
  written in the *same DB transaction* as the inventory change via
  `inventoryService.createOpeningBalance` (and the internal `decreaseAvailableStock`,
  which uses `SELECT ... FOR UPDATE` so concurrent decrements cannot drive stock
  negative). Inventory/movement are atomic.
- **API** under `/api/v1`:
  - `GET /api/v1/inventory` (filters + search + pagination + sort, scope-filtered)
  - `GET /api/v1/inventory/:id`
  - `POST /api/v1/inventory/opening-balance`
  - `GET /api/v1/batches`, `GET /api/v1/batches/:id`
  - `GET /api/v1/stock-movements`, `GET /api/v1/stock-movements/:id`
- **Permissions** seeded: `inventory.view/create/update`, `stock_movement.view`,
  `batch.view/create/update`.
- Frontend "Inventory" sidebar section: Stock Overview, Batches, Stock
  Movements, and an Opening Balance form.

No transfers, adjustments, quarantine/expiry/recall workflows, POS, permits are
implemented here — they will reuse this inventory service layer.

## Product Master (Task 05)

Product master data is **organization-level**: each `products` row belongs to exactly
one organization and is visible only to users whose `user_scopes` include it as
`organization` (master data is never branch-level).

Schema (migration 005):

```
organizations
  └── products (per-organization code/barcode unique, registration number unique,
                 brand/generic/dosage_form/route/category/therapeutic_category/manufacturer FKs,
                 prescription_classification, controlled_classification, antibiotic_classification,
                 storage_requirement, min/max/reorder policy levels, status)
      ├── product_active_ingredients → active_ingredients (strength per-ingredient;
      │   supports single- and combination medicines)
      ├── product_units → units (base/purchase/inventory/selling flags per product)
      ├── product_unit_conversions (product-specific from→to factors, positive,
      │   no self-conversions, no duplicate from→to per product)
      └── product_relationships (equivalent | alternative | different_strength |
          different_dosage_form, no self-links, no duplicates)

brands, generics, dosage_forms, routes, categories, therapeutic_categories,
manufacturers (+country_of_origin), active_ingredients, units —
each organization-scoped with (organization_id, code) unique and a simple CRUD of
list/get/create/update/deactivate/activate.
```

Permissions are seeded per resource/action (`product.*`, `unit.*`, `brand.*`, …) and
the System Administrator role receives them via the migration. Every API (see
`/api/v1/products`, `/api/v1/brands`, …) requires authentication + its permission
code + organization scope; list endpoints filter to the caller's org scope.

Products expose list (`search`, `status`, `brandId`, `genericId`, `categoryId`,
`dosageFormId`, `routeId`, `prescriptionClassification`, `controlledClassification`,
`antibioticClassification`, `organizationId`, `page`, `limit`, `sort`), detail
(including ingredients/units/conversions/relationships), create, update, activate,
deactivate, and `PUT /api/v1/products/:id/{active-ingredients|units|unit-conversions|relationships}`
replacement endpoints (server-validated: positive factors, no self/self-conversions,
no duplicates, referenced master rows must belong to the same organization and be active).

No inventory quantities, prices, batches, suppliers, or clinical validation exist at this stage —
only the product master catalog.

Frontend: "Master Data" nav section lists Products + each master entity; a Products
list page (search/filters/pagination/create/edit/deactivate, with `<Can>` permission
gates) and a Product detail page organized into Identity, Classification, Storage/Stock
Policy, Active Ingredients, Units, Unit Conversions, Relationships.

## Authorization (Task 04)

The authorization stack is separate from authentication:

```
User ── user_roles ──> Role ── role_permissions ──> Permission (MODULE.RESOURCE.ACTION)
User ── user_scopes ──> Organization / Branch / Warehouse
```

- **Roles** are definable entities (`SYSTEM_ADMINISTRATOR` is seeded for the
  dev admin only; no role grants are hardcoded in code).
- **Permissions** are controlled system codes seeded in migration 004
  (`organization.*`, `branch.*`, `warehouse.*`, `storage_location.*`,
  `user.*`, `role.*`, `permission.view`). Future modules add their own.
- **User roles**: many-to-many via `user_roles`. Users created through the UI get
  no roles until explicitly assigned.
- **Data scope**: `user_scopes` rows of `organization | branch | warehouse`.
  A branch scope grants that branch (and its warehouses/locations) only — not the
  whole organization. Organization and branch scopes never imply permission;
  permission never implies scope. All checks are resolved server-side on every request.
- **Middleware**: `authenticate` attaches `req.user`; `requirePermission(code)`
  returns `403 FORBIDDEN` (with a generic message) when the user lacks the code;
  scope is enforced inside the organization/branch/warehouse/storage-location
  services via `authorizationService`.
- `GET /api/v1/auth/me` returns the authenticated user plus current `roles` and
  `permissions` (authorization data is resolved server-side per request — never
  trusted from the JWT or frontend).

Admin endpoints (all behind authentication + permission checks):

- `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/:id`,
  `POST /api/v1/users/:id/deactivate|activate`, `PUT /api/v1/users/:id/roles`,
  `PUT /api/v1/users/:id/scopes`
- `GET/POST /api/v1/roles`, `GET/PATCH /api/v1/roles/:id`,
  `POST /api/v1/roles/:id/deactivate`, `PUT /api/v1/roles/:id/permissions`
- `GET /api/v1/permissions?module=&resource=`

All Task-03 entity endpoints now additionally enforce permissions and data scope
(`organization.view/create/update/deactivate`, `branch.*`, `warehouse.*`,
`storage_location.*`).

Frontend: `AuthContext` carries the backend-provided `permissions`; a shared
`<Can permission="…">` component gates nav links and action buttons, and the
Users/Roles/Permissions pages call the real administration API.

## Authentication (Task 02)

- HTTP-only cookie session: `POST /api/v1/auth/login` sets an `httpOnly` JWT
  cookie (`Secure` in production, `SameSite=Lax` by default) — the token is
  never exposed to frontend JavaScript and never stored in localStorage.
- `POST /api/v1/auth/logout` clears the cookie.
- `GET /api/v1/auth/me` returns the authenticated user (or `401`).
- Passwords are hashed with bcrypt (`bcryptjs`); plaintext passwords are
  never stored, logged, or returned.
- The frontend AuthProvider calls `/api/v1/auth/me` on load — the backend is
  authoritative for authentication state. Unauthenticated users are
  redirected to `/login`; login success navigates back to the app.

### Database (Task 02 scope)

Only the authentication table is created at this stage:

```bash
npm --prefix server run migrate     # creates users table
npm --prefix server run seed        # creates ONE local dev account
```

**Development seed account (local testing only):**

- Email: `admin@pharmacy.local`
- Password: `Admin@12345` (override with `SEED_ADMIN_PASSWORD`)
- The dev user is assigned the seeded `System Administrator` role (all
  permissions) and organization-scope on the seeded demo organization.
  Users created later get no roles/scopes until explicitly assigned.

## Running tests

```bash
npm --prefix server test    # backend auth API tests (node:test + supertest)
npm --prefix client test    # frontend tests (vitest + Testing Library)
```

Backend tests run against a separate `pharmacy_erp_test` database.

## Future work (deferred by task boundaries)

- Task 07 onward: inventory feeds procurement, goods receiving, POS,
  prescriptions, dispensing, returns, transfers, adjustments, counts,
  quarantine/expiry/recall, pricing, notifications, and audit.

## Verify the API health endpoint

```bash
curl http://localhost:5000/api/v1/health
# or
npm run health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "pharmacy-erp-server",
    "uptimeSeconds": 3,
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

## Build the frontend

```bash
npm run build
```

## What is NOT implemented yet

- Authentication / authorization (Task 02+)
- Database schema / migrations
- All business modules (POS, sales, prescriptions, inventory, …)
- Dashboards, reports, notifications

See `docs/stage-10-implementation-plan.txt` for the phased plan.
#   p h a r m a c y - m a n a g e m e n t - s y s t e m  
 