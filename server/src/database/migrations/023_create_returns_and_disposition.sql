-- Task 14 — Customer Returns, Supplier Returns, and Returned-Stock Disposition.
-- Dependency order: sales/goods_receipts -> customer_returns/supplier_returns -> return_lines -> inspections

-- 1. Hardening safety for financial records:
-- Prevent destructive cascaded erasure of completed payments, customer receivables, and refunds
ALTER TABLE payments DROP FOREIGN KEY fk_payments_recorder;
ALTER TABLE payments ADD CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE customer_receivables DROP FOREIGN KEY fk_cr_customer;
ALTER TABLE customer_receivables ADD CONSTRAINT fk_cr_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE customer_receivables DROP FOREIGN KEY fk_cr_creator;
ALTER TABLE customer_receivables ADD CONSTRAINT fk_cr_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE refunds DROP FOREIGN KEY fk_refunds_payment;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE refunds DROP FOREIGN KEY fk_refunds_creator;
ALTER TABLE refunds ADD CONSTRAINT fk_refunds_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Customer Returns Table
CREATE TABLE IF NOT EXISTS customer_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  sale_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  return_number VARCHAR(50) NOT NULL,
  return_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('draft', 'submitted', 'pending_inspection', 'approved', 'rejected', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  reason TEXT NOT NULL,
  outcome ENUM('refund', 'exchange', 'no_refund', 'pending') NOT NULL DEFAULT 'pending',
  refund_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  refund_id BIGINT UNSIGNED NULL,
  inspected_by INT UNSIGNED NULL,
  inspected_at DATETIME NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  rejection_reason TEXT NULL,
  cancelled_reason TEXT NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_returns_org_number (organization_id, return_number),
  KEY idx_customer_returns_sale (sale_id),
  KEY idx_customer_returns_customer (customer_id),
  KEY idx_customer_returns_org_branch (organization_id, branch_id),
  KEY idx_customer_returns_status (status),
  KEY idx_customer_returns_date (return_date),
  CONSTRAINT fk_cr_org_ref FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cr_branch_ref FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cr_warehouse_ref FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cr_sale_ref FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cr_customer_ref FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cr_refund_ref FOREIGN KEY (refund_id) REFERENCES refunds (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cr_inspector_ref FOREIGN KEY (inspected_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cr_approver_ref FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cr_creator_ref FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Customer Return Lines Table
CREATE TABLE IF NOT EXISTS customer_return_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_return_id BIGINT UNSIGNED NOT NULL,
  sale_line_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  storage_location_id INT UNSIGNED NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  condition_state ENUM('sealed_intact', 'opened', 'damaged', 'expired', 'unknown') NOT NULL DEFAULT 'sealed_intact',
  disposition ENUM('quarantine', 'return_to_stock', 'damaged', 'awaiting_disposal', 'disposed', 'none') NOT NULL DEFAULT 'none',
  disposition_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crl_return (customer_return_id),
  KEY idx_crl_sale_line (sale_line_id),
  KEY idx_crl_product (product_id),
  KEY idx_crl_batch (batch_id),
  CONSTRAINT chk_crl_quantity_positive CHECK (quantity > 0),
  CONSTRAINT fk_crl_return FOREIGN KEY (customer_return_id) REFERENCES customer_returns (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_crl_sale_line FOREIGN KEY (sale_line_id) REFERENCES sale_lines (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_crl_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_crl_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_crl_unit FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_crl_location FOREIGN KEY (storage_location_id) REFERENCES storage_locations (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Supplier Returns Table
CREATE TABLE IF NOT EXISTS supplier_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  goods_receipt_id INT UNSIGNED NOT NULL,
  return_number VARCHAR(50) NOT NULL,
  return_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('draft', 'submitted', 'approved', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  reason TEXT NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  completed_by INT UNSIGNED NULL,
  completed_at DATETIME NULL,
  cancellation_reason TEXT NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_returns_org_number (organization_id, return_number),
  KEY idx_supplier_returns_supplier (supplier_id),
  KEY idx_supplier_returns_gr (goods_receipt_id),
  KEY idx_supplier_returns_org_branch (organization_id, branch_id),
  KEY idx_supplier_returns_status (status),
  KEY idx_supplier_returns_date (return_date),
  CONSTRAINT fk_sr_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sr_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_goods_receipt FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sr_completer FOREIGN KEY (completed_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sr_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Supplier Return Lines Table
CREATE TABLE IF NOT EXISTS supplier_return_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_return_id BIGINT UNSIGNED NOT NULL,
  goods_receipt_line_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  storage_location_id INT UNSIGNED NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_srl_return (supplier_return_id),
  KEY idx_srl_gr_line (goods_receipt_line_id),
  KEY idx_srl_product (product_id),
  KEY idx_srl_batch (batch_id),
  CONSTRAINT chk_srl_quantity_positive CHECK (quantity > 0),
  CONSTRAINT fk_srl_return FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_srl_gr_line FOREIGN KEY (goods_receipt_line_id) REFERENCES goods_receipt_lines (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_srl_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_srl_batch FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_srl_unit FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_srl_location FOREIGN KEY (storage_location_id) REFERENCES storage_locations (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
