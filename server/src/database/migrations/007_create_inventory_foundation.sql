-- Task 06 — Inventory Foundation.
-- Dependency order: batches -> inventory -> stock_movements

CREATE TABLE IF NOT EXISTS batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_number VARCHAR(80) NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_batches_org_product_number (organization_id, product_id, batch_number),
  KEY idx_batches_org_product (organization_id, product_id),
  KEY idx_batches_expiry (expiry_date),
  CONSTRAINT fk_batches_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_batches_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One physical stock position per
--   (organization, branch, warehouse, storage_location, product, batch, unit, status).
-- The 'available' variant of this row represents freely usable stock; other
-- statuses are physically present but not usable. Physical totals per product
-- are the SUM of quantity across every status row for the same position.
CREATE TABLE IF NOT EXISTS inventory (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  storage_location_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  status ENUM('available', 'reserved', 'quarantined', 'damaged', 'expired', 'recalled', 'returned', 'awaiting_disposal', 'disposed') NOT NULL,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_position (organization_id, branch_id, warehouse_id, storage_location_id, product_id, batch_id, unit_id, status),
  KEY idx_inventory_org_branch (organization_id, branch_id),
  KEY idx_inventory_warehouse (warehouse_id),
  KEY idx_inventory_location (storage_location_id),
  KEY idx_inventory_product (product_id),
  KEY idx_inventory_batch (batch_id),
  KEY idx_inventory_status (status),
  CONSTRAINT chk_inventory_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT fk_inventory_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_location FOREIGN KEY (storage_location_id) REFERENCES storage_locations (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_unit FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only stock movement ledger: every quantity change references
-- the business context (type + optional reference_type/reference_id),
-- the affected product/batch/location/unit, who did it, and a signed delta.
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  storage_location_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  movement_type ENUM(
    'opening_balance', 'purchase_receipt', 'sale', 'dispensing',
    'customer_return', 'supplier_return', 'transfer_in', 'transfer_out',
    'adjustment', 'damage', 'expiry', 'disposal', 'recall', 'other'
  ) NOT NULL,
  quantity_delta DECIMAL(14,3) NOT NULL,
  reference_type VARCHAR(60) NULL,
  reference_id INT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movements_org (organization_id, created_at),
  KEY idx_movements_product (product_id),
  KEY idx_movements_batch (batch_id),
  KEY idx_movements_branch (branch_id),
  KEY idx_movements_warehouse (warehouse_id),
  KEY idx_movements_location (storage_location_id),
  KEY idx_movements_type (movement_type),
  KEY idx_movements_reference (reference_type, reference_id),
  CONSTRAINT fk_movements_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_location FOREIGN KEY (storage_location_id) REFERENCES storage_locations (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_unit FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movements_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
