-- Task 22 — Data Import Jobs Tracking
-- Organization-scoped log of all master data import operations.

CREATE TABLE IF NOT EXISTS import_jobs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_uuid VARCHAR(36) NOT NULL,
  organization_id INT UNSIGNED NOT NULL,
  initiated_by INT UNSIGNED NOT NULL,
  import_type ENUM('products', 'suppliers', 'customers') NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  status ENUM('pending', 'previewed', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  successful_rows INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows INT UNSIGNED NOT NULL DEFAULT 0,
  error_summary JSON NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_jobs_uuid (job_uuid),
  KEY idx_import_jobs_org_status (organization_id, status),
  KEY idx_import_jobs_org_type (organization_id, import_type),
  CONSTRAINT fk_import_jobs_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_import_jobs_user FOREIGN KEY (initiated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
