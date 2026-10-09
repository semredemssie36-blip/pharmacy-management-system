-- Task 18 — Centralized Approvals and Authorized Overrides Foundation.
-- Tables: approval_policies, approval_requests, approval_history

CREATE TABLE IF NOT EXISTS approval_policies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED NOT NULL,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  threshold_value DECIMAL(12,2) NULL,
  required_permission VARCHAR(100) NOT NULL,
  require_separation_of_duties TINYINT(1) NOT NULL DEFAULT 1,
  auto_execute_on_approval TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_policy_org_cat (organization_id, category),
  CONSTRAINT fk_policy_org FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(50) NOT NULL,
  organization_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  category VARCHAR(50) NOT NULL,
  policy_id INT UNSIGNED NULL,
  requester_id INT UNSIGNED NOT NULL,
  target_entity_type VARCHAR(50) NOT NULL,
  target_entity_id INT UNSIGNED NOT NULL,
  target_reference VARCHAR(100) NULL,
  requested_value DECIMAL(12,2) NULL,
  original_value DECIMAL(12,2) NULL,
  reason TEXT NOT NULL,
  notes TEXT NULL,
  status ENUM('pending', 'approved', 'rejected', 'executed', 'cancelled', 'expired', 'execution_failed') NOT NULL DEFAULT 'pending',
  snapshot_data LONGTEXT NULL,
  stale_fingerprint VARCHAR(255) NULL,
  approver_id INT UNSIGNED NULL,
  decision_reason TEXT NULL,
  decision_at TIMESTAMP NULL,
  executed_at TIMESTAMP NULL,
  execution_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_approval_request_number (request_number),
  KEY idx_approval_org_status (organization_id, status),
  KEY idx_approval_branch_status (branch_id, status),
  KEY idx_approval_target (target_entity_type, target_entity_id),
  KEY idx_approval_requester (requester_id),
  KEY idx_approval_approver (approver_id),
  CONSTRAINT fk_approval_org FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_branch FOREIGN KEY (branch_id)
    REFERENCES branches (id) ON DELETE SET NULL,
  CONSTRAINT fk_approval_policy FOREIGN KEY (policy_id)
    REFERENCES approval_policies (id) ON DELETE SET NULL,
  CONSTRAINT fk_approval_requester FOREIGN KEY (requester_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_approver FOREIGN KEY (approver_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_history (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  approval_request_id INT UNSIGNED NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_id INT UNSIGNED NOT NULL,
  notes TEXT NULL,
  payload LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_approval_history_request (approval_request_id),
  CONSTRAINT fk_history_approval_req FOREIGN KEY (approval_request_id)
    REFERENCES approval_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_actor FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
