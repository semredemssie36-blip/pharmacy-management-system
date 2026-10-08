-- Task 03 — Organization, Branch, Warehouse, Storage Location foundation.
-- Dependency order: organizations -> branches -> warehouses -> storage_locations

CREATE TABLE IF NOT EXISTS organizations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branches_org_code (organization_id, code),
  KEY idx_branches_organization (organization_id),
  CONSTRAINT fk_branches_organization FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouses (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_warehouses_branch_code (branch_id, code),
  KEY idx_warehouses_branch (branch_id),
  CONSTRAINT fk_warehouses_branch FOREIGN KEY (branch_id)
    REFERENCES branches (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storage_locations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  storage_condition ENUM('normal', 'refrigerated', 'controlled') NOT NULL DEFAULT 'normal',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_storage_locations_warehouse_code (warehouse_id, code),
  KEY idx_storage_locations_warehouse (warehouse_id),
  CONSTRAINT fk_storage_locations_warehouse FOREIGN KEY (warehouse_id)
    REFERENCES warehouses (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
