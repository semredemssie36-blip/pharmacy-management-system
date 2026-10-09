-- Task 13 — Payments, Customer Credit, and Accounts Receivable Foundation.

ALTER TABLE sales ADD COLUMN paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales ADD COLUMN payment_status ENUM('unpaid', 'partially_paid', 'paid', 'credit') NOT NULL DEFAULT 'unpaid';

ALTER TABLE dispensings ADD COLUMN subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensings ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensings ADD COLUMN total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensings ADD COLUMN paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensings ADD COLUMN payment_status ENUM('unpaid', 'partially_paid', 'paid', 'credit') NOT NULL DEFAULT 'unpaid';
ALTER TABLE dispensings ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ETB';

ALTER TABLE dispensing_lines ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensing_lines ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE dispensing_lines ADD COLUMN line_total DECIMAL(14,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  payment_number VARCHAR(50) NOT NULL,
  payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method ENUM('cash', 'card', 'bank_transfer', 'mobile_money') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ETB',
  status ENUM('pending', 'completed', 'failed', 'cancelled', 'partially_refunded', 'refunded') NOT NULL DEFAULT 'completed',
  customer_id INT UNSIGNED NULL,
  external_reference VARCHAR(100) NULL,
  notes TEXT NULL,
  recorded_by INT UNSIGNED NOT NULL,
  verified_by INT UNSIGNED NULL,
  verified_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  cancelled_at DATETIME NULL,
  cancellation_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_org_number (organization_id, payment_number),
  KEY idx_payments_org_status (organization_id, status),
  KEY idx_payments_branch (branch_id),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_date (payment_date),
  KEY idx_payments_recorded_by (recorded_by),
  CONSTRAINT chk_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_payments_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_payments_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_payments_verifier FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_payments_canceller FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  reference_type ENUM('sale', 'dispensing', 'receivable') NOT NULL,
  reference_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pa_org (organization_id),
  KEY idx_pa_payment (payment_id),
  KEY idx_pa_reference (reference_type, reference_id),
  CONSTRAINT chk_pa_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_pa_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pa_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_receivables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  receivable_number VARCHAR(50) NOT NULL,
  reference_type ENUM('sale', 'dispensing') NOT NULL,
  reference_id BIGINT UNSIGNED NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  balance_amount DECIMAL(14,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('unpaid', 'partially_paid', 'paid', 'cancelled') NOT NULL DEFAULT 'unpaid',
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cr_org_number (organization_id, receivable_number),
  UNIQUE KEY uq_cr_ref (organization_id, reference_type, reference_id),
  KEY idx_cr_customer_status (customer_id, status),
  KEY idx_cr_org_branch (organization_id, branch_id),
  KEY idx_cr_due_date (due_date),
  CONSTRAINT chk_cr_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT chk_cr_paid_non_negative CHECK (paid_amount >= 0),
  CONSTRAINT chk_cr_balance_non_negative CHECK (balance_amount >= 0),
  CONSTRAINT fk_cr_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cr_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cr_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cr_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  refund_number VARCHAR(50) NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  reference_type ENUM('sale', 'dispensing') NOT NULL,
  reference_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason TEXT NOT NULL,
  refund_method ENUM('cash', 'card', 'bank_transfer', 'mobile_money', 'credit_adjustment') NOT NULL,
  external_reference VARCHAR(100) NULL,
  status ENUM('completed', 'cancelled') NOT NULL DEFAULT 'completed',
  approved_by INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refunds_org_number (organization_id, refund_number),
  KEY idx_refunds_payment (payment_id),
  KEY idx_refunds_ref (reference_type, reference_id),
  KEY idx_refunds_org_branch (organization_id, branch_id),
  CONSTRAINT chk_refunds_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_refunds_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
