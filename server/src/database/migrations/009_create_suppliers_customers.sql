-- Task 07 — Supplier & Customer organization-level master data.

CREATE TABLE IF NOT EXISTS suppliers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  code VARCHAR(50) NULL,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(120) NULL,
  telephone VARCHAR(50) NULL,
  email VARCHAR(150) NULL,
  address TEXT NULL,
  country VARCHAR(80) NULL,
  tax_registration_number VARCHAR(80) NULL,
  notes TEXT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_org_code (organization_id, code),
  KEY idx_suppliers_org_status (organization_id, status),
  CONSTRAINT fk_suppliers_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  code VARCHAR(50) NULL,
  name VARCHAR(150) NOT NULL,
  customer_type ENUM('individual', 'business', 'institution') NOT NULL DEFAULT 'individual',
  telephone VARCHAR(50) NULL,
  email VARCHAR(150) NULL,
  address TEXT NULL,
  territory VARCHAR(80) NULL,
  pricing_tier VARCHAR(80) NULL,
  credit_limit DECIMAL(12,2) NULL,
  payment_terms VARCHAR(120) NULL,
  notes TEXT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_org_code (organization_id, code),
  KEY idx_customers_org_status (organization_id, status),
  CONSTRAINT chk_customers_credit_limit_non_negative CHECK (credit_limit IS NULL OR credit_limit >= 0),
  CONSTRAINT fk_customers_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
