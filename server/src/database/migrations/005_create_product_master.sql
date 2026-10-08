-- Task 05 — Product Master foundation.
-- All master data is organization-scoped.
-- Dependency order: standalone masters -> products -> relations.

CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brands_org_code (organization_id, code),
  KEY idx_brands_org (organization_id),
  CONSTRAINT fk_brands_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generics (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_generics_org_code (organization_id, code),
  KEY idx_generics_org (organization_id),
  CONSTRAINT fk_generics_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dosage_forms (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dosage_forms_org_code (organization_id, code),
  KEY idx_dosage_forms_org (organization_id),
  CONSTRAINT fk_dosage_forms_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS routes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_routes_org_code (organization_id, code),
  KEY idx_routes_org (organization_id),
  CONSTRAINT fk_routes_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_org_code (organization_id, code),
  KEY idx_categories_org (organization_id),
  CONSTRAINT fk_categories_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS therapeutic_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_therapeutic_categories_org_code (organization_id, code),
  KEY idx_therapeutic_categories_org (organization_id),
  CONSTRAINT fk_therapeutic_categories_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manufacturers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  country_of_origin VARCHAR(100) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_manufacturers_org_code (organization_id, code),
  KEY idx_manufacturers_org (organization_id),
  CONSTRAINT fk_manufacturers_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS active_ingredients (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_active_ingredients_org_code (organization_id, code),
  KEY idx_active_ingredients_org (organization_id),
  CONSTRAINT fk_active_ingredients_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_units_org_code (organization_id, code),
  KEY idx_units_org (organization_id),
  CONSTRAINT fk_units_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  barcode VARCHAR(60) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  brand_id INT UNSIGNED NULL,
  generic_id INT UNSIGNED NULL,
  dosage_form_id INT UNSIGNED NULL,
  route_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  therapeutic_category_id INT UNSIGNED NULL,
  manufacturer_id INT UNSIGNED NULL,
  registration_number VARCHAR(80) NULL,
  prescription_classification ENUM('prescription', 'otc') NOT NULL,
  controlled_classification ENUM('none', 'controlled', 'restricted') NOT NULL DEFAULT 'none',
  antibiotic_classification ENUM('none', 'antibiotic') NOT NULL DEFAULT 'none',
  storage_requirement ENUM('normal', 'refrigerated', 'controlled') NOT NULL DEFAULT 'normal',
  min_stock_level DECIMAL(12,3) NULL,
  max_stock_level DECIMAL(12,3) NULL,
  reorder_level DECIMAL(12,3) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_org_code (organization_id, code),
  UNIQUE KEY uq_products_org_barcode (organization_id, barcode),
  UNIQUE KEY uq_products_org_registration (organization_id, registration_number),
  KEY idx_products_org_status (organization_id, status),
  KEY idx_products_name (name),
  CONSTRAINT fk_products_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_generic FOREIGN KEY (generic_id) REFERENCES generics (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_dosage_form FOREIGN KEY (dosage_form_id) REFERENCES dosage_forms (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_route FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_therapeutic_category FOREIGN KEY (therapeutic_category_id) REFERENCES therapeutic_categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_products_manufacturer FOREIGN KEY (manufacturer_id) REFERENCES manufacturers (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product supports single-ingredient and combination medicines.
CREATE TABLE IF NOT EXISTS product_active_ingredients (
  product_id INT UNSIGNED NOT NULL,
  active_ingredient_id INT UNSIGNED NOT NULL,
  strength VARCHAR(80) NULL,
  PRIMARY KEY (product_id, active_ingredient_id),
  KEY idx_pai_ingredient (active_ingredient_id),
  CONSTRAINT fk_pai_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pai_ingredient FOREIGN KEY (active_ingredient_id) REFERENCES active_ingredients (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Units available/used for a product, marking its purchasing/inventory/selling units.
CREATE TABLE IF NOT EXISTS product_units (
  product_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  is_base_unit TINYINT(1) NOT NULL DEFAULT 0,
  is_purchase_unit TINYINT(1) NOT NULL DEFAULT 0,
  is_inventory_unit TINYINT(1) NOT NULL DEFAULT 0,
  is_selling_unit TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, unit_id),
  KEY idx_product_units_unit (unit_id),
  CONSTRAINT fk_pu_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pu_unit FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product-specific unit conversions (factors are never treated as global rules).
CREATE TABLE IF NOT EXISTS product_unit_conversions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  from_unit_id INT UNSIGNED NOT NULL,
  to_unit_id INT UNSIGNED NOT NULL,
  factor DECIMAL(14,6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_puc_from_to (product_id, from_unit_id, to_unit_id),
  KEY idx_puc_product (product_id),
  CONSTRAINT chk_puc_factor_positive CHECK (factor > 0),
  CONSTRAINT chk_puc_from_to_diff CHECK (from_unit_id <> to_unit_id),
  CONSTRAINT fk_puc_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_puc_from FOREIGN KEY (from_unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_puc_to FOREIGN KEY (to_unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Structured product relationships.
CREATE TABLE IF NOT EXISTS product_relationships (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  related_product_id INT UNSIGNED NOT NULL,
  relationship_type ENUM('equivalent', 'alternative', 'different_strength', 'different_dosage_form') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pr_product_related_type (product_id, related_product_id, relationship_type),
  KEY idx_pr_related (related_product_id),
  CONSTRAINT chk_pr_no_self CHECK (product_id <> related_product_id),
  CONSTRAINT fk_pr_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pr_related FOREIGN KEY (related_product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
