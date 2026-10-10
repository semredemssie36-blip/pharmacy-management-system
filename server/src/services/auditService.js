/**
 * Task 19 — Centralized Audit Trail and Activity History Service
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 *
 * Responsibilities:
 * - Append-only recording of business and security events.
 * - Transactional consistency (writes inside caller's DB transaction connection when provided).
 * - Sensitive data filtering and redaction (passwords, JWTs, card credentials, clinical secrets).
 * - Multi-tier data scope enforcement (Organization, Branch, Warehouse).
 * - Diff calculation helper for state mutation audits.
 */
import auditRepository from '../repositories/auditRepository.js';
import authorizationService from './authorizationService.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import logger from '../utils/logger.js';

// Sensitive keys that must NEVER be persisted in audit records
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /password_hash/i,
  /token/i,
  /jwt/i,
  /secret/i,
  /auth_cookie/i,
  /authorization/i,
  /credit_?card/i,
  /card_?number/i,
  /card/i,
  /cvv/i,
  /pin/i,
  /api_?key/i,
];

// Keys to ignore during state diff comparisons
const DEFAULT_IGNORED_DIFF_KEYS = new Set([
  'updated_at',
  'created_at',
  'password_hash',
  'password',
]);

class AuditService {
  /**
   * Recursive sanitizer to redact sensitive values and bound string lengths
   */
  sanitize(input, depth = 0) {
    if (depth > 6 || input === null || input === undefined) return input;

    if (typeof input === 'string') {
      // Bound overly long strings to prevent storage bloat
      if (input.length > 2000) {
        return input.slice(0, 2000) + '...[TRUNCATED]';
      }
      return input;
    }

    if (typeof input !== 'object') {
      return input;
    }

    if (Array.isArray(input)) {
      return input.slice(0, 50).map((item) => this.sanitize(item, depth + 1));
    }

    const clean = {};
    for (const [key, value] of Object.entries(input)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = this.sanitize(value, depth + 1);
      }
    }
    return clean;
  }

  /**
   * Helper to calculate differences between two state snapshots
   */
  calculateDiff(beforeState, afterState, customIgnoreKeys = []) {
    if (!beforeState || !afterState) return null;

    const ignore = new Set([...DEFAULT_IGNORED_DIFF_KEYS, ...customIgnoreKeys]);
    const beforeDiff = {};
    const afterDiff = {};
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);

    for (const key of allKeys) {
      if (ignore.has(key)) continue;

      const valBefore = beforeState[key];
      const valAfter = afterState[key];

      const stringifiedBefore = JSON.stringify(valBefore);
      const stringifiedAfter = JSON.stringify(valAfter);

      if (stringifiedBefore !== stringifiedAfter) {
        beforeDiff[key] = valBefore;
        afterDiff[key] = valAfter;
        hasChanges = true;
      }
    }

    if (!hasChanges) return null;

    const fieldDiffs = {};
    for (const key of Object.keys(beforeDiff)) {
      fieldDiffs[key] = {
        old: beforeDiff[key],
        new: afterDiff[key],
      };
    }

    return {
      before: this.sanitize(beforeDiff),
      after: this.sanitize(afterDiff),
      ...fieldDiffs,
    };
  }

  /**
   * Resolve user accessible scopes (Organizations, Branches)
   */
  async getUserAccessibleScopes(userId, connection = null) {
    const scope = await authorizationService.getUserScope(userId);
    const orgIds = new Set(scope.organizationIds);

    if (scope.branchIds.size > 0) {
      const runner = connection || auditRepository.getPool();
      const branchArr = [...scope.branchIds];
      const [bRows] = await runner.query(
        `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
        branchArr,
      );
      bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }

    return {
      organizationIds: orgIds,
      explicitOrgIds: scope.organizationIds,
      branchIds: scope.branchIds,
      warehouseIds: scope.warehouseIds,
    };
  }

  /**
   * Record a centralized audit event.
   * If caller passes `connection`, audit writes inside that transaction.
   * If the business mutation rolls back, this audit entry rolls back consistently.
   */
  async log(data, connection = null) {
    try {
      const activeConn = connection || data?.connection || null;
      const {
        organizationId,
        branchId = null,
        warehouseId = null,
        actorUserId = null,
        action,
        resourceType,
        resourceId = null,
        resourceReference = null,
        outcome = 'success',
        details = null,
        beforeValues = null,
        afterValues = null,
        reason = null,
        ipAddress = null,
      } = data;

      if (!organizationId || !action || !resourceType) {
        logger.warn('Audit log skipped: missing required parameters', { organizationId, action, resourceType });
        return null;
      }

      const sanitizedDetails = details ? this.sanitize(details) : null;
      const sanitizedBefore = beforeValues ? this.sanitize(beforeValues) : null;
      const sanitizedAfter = afterValues ? this.sanitize(afterValues) : null;
      const sanitizedReason = reason ? (typeof reason === 'string' && reason.length > 500 ? reason.slice(0, 500) : reason) : null;

      const logId = await auditRepository.createLog(
        {
          organizationId: Number(organizationId),
          branchId: branchId ? Number(branchId) : null,
          warehouseId: warehouseId ? Number(warehouseId) : null,
          actorUserId: actorUserId ? Number(actorUserId) : null,
          action: String(action).trim(),
          resourceType: String(resourceType).trim(),
          resourceId: resourceId ? Number(resourceId) : null,
          resourceReference: resourceReference ? String(resourceReference).trim() : null,
          outcome: outcome === 'failure' ? 'failure' : 'success',
          details: sanitizedDetails,
          beforeValues: sanitizedBefore,
          afterValues: sanitizedAfter,
          reason: sanitizedReason,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
        },
        activeConn,
      );

      return logId;
    } catch (err) {
      logger.error('Failed to record audit log', { error: err.message, action: data?.action });
      // If we are inside an explicit transaction, re-throw so transaction rolls back
      if (connection) {
        throw err;
      }
      return null;
    }
  }

  /**
   * List audit logs with scope enforcement and filtering
   */
  async listLogs(query, user) {
    const userScope = await this.getUserAccessibleScopes(user.id);
    const orgId = query.organizationId ? Number(query.organizationId) : [...userScope.organizationIds][0] || user.organization_id;

    if (!orgId) {
      throw new AppError('Organization context required', { statusCode: 400 });
    }

    if (!userScope.organizationIds.has(Number(orgId))) {
      throw new AppError('Forbidden: Organization is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    let branchIds = null;
    if (userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(orgId))) {
      // User is branch-scoped: restricted to their branches
      branchIds = [...userScope.branchIds];
      if (query.branchId && !userScope.branchIds.has(Number(query.branchId))) {
        throw new AppError('Forbidden: Branch is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
      if (query.branchId) {
        branchIds = [Number(query.branchId)];
      }
    } else if (query.branchId) {
      branchIds = [Number(query.branchId)];
    }

    let warehouseId = query.warehouseId ? Number(query.warehouseId) : undefined;
    if (userScope.warehouseIds.size > 0 && !userScope.explicitOrgIds.has(Number(orgId)) && userScope.branchIds.size === 0) {
      if (!userScope.warehouseIds.has(warehouseId)) {
        throw new AppError('Forbidden: Warehouse is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
    }

    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));

    return auditRepository.listLogs({
      organizationId: orgId,
      branchIds,
      warehouseId,
      actorUserId: query.actorUserId ? parseInt(query.actorUserId, 10) : undefined,
      action: query.action ? String(query.action).trim() : undefined,
      resourceType: query.resourceType ? String(query.resourceType).trim() : undefined,
      resourceId: query.resourceId ? parseInt(query.resourceId, 10) : undefined,
      resourceReference: query.resourceReference ? String(query.resourceReference).trim() : undefined,
      outcome: query.outcome ? String(query.outcome).trim() : undefined,
      fromDate: query.fromDate ? String(query.fromDate).trim() : undefined,
      toDate: query.toDate ? String(query.toDate).trim() : undefined,
      search: query.search ? String(query.search).trim() : undefined,
      page,
      limit,
    });
  }

  /**
   * Get single audit log with authorization scope check
   */
  async getLogById(id, user) {
    const log = await auditRepository.getLogById(id);
    if (!log) {
      throw new AppError('Audit log entry not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const userScope = await this.getUserAccessibleScopes(user.id);
    if (!userScope.organizationIds.has(Number(log.organization_id))) {
      throw new AppError('Forbidden: Audit entry is out of organization scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    if (log.branch_id && userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(log.organization_id))) {
      if (!userScope.branchIds.has(Number(log.branch_id))) {
        throw new AppError('Forbidden: Audit entry is out of branch scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
    }

    return log;
  }

  /**
   * Get aggregated summary metrics for audit dashboard
   */
  async getSummaryStats(query, user) {
    const userScope = await this.getUserAccessibleScopes(user.id);
    const orgId = query.organizationId ? Number(query.organizationId) : [...userScope.organizationIds][0] || user.organization_id;

    if (!orgId || !userScope.organizationIds.has(Number(orgId))) {
      throw new AppError('Forbidden: Organization is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    let branchIds = null;
    if (userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(orgId))) {
      branchIds = [...userScope.branchIds];
    } else if (query.branchId) {
      branchIds = [Number(query.branchId)];
    }

    return auditRepository.getSummaryStats(orgId, branchIds);
  }

  /**
   * Bounded export of audit logs in CSV or JSON format
   */
  async exportLogs(query, user) {
    const userScope = await this.getUserAccessibleScopes(user.id);
    const orgId = query.organizationId ? Number(query.organizationId) : [...userScope.organizationIds][0] || user.organization_id;

    if (!orgId || !userScope.organizationIds.has(Number(orgId))) {
      throw new AppError('Forbidden: Organization is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    let branchIds = null;
    if (userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(orgId))) {
      branchIds = [...userScope.branchIds];
    } else if (query.branchId) {
      branchIds = [Number(query.branchId)];
    }

    const items = await auditRepository.exportLogs({
      organizationId: orgId,
      branchIds,
      warehouseId: query.warehouseId ? Number(query.warehouseId) : undefined,
      actorUserId: query.actorUserId ? parseInt(query.actorUserId, 10) : undefined,
      action: query.action ? String(query.action).trim() : undefined,
      resourceType: query.resourceType ? String(query.resourceType).trim() : undefined,
      resourceId: query.resourceId ? parseInt(query.resourceId, 10) : undefined,
      resourceReference: query.resourceReference ? String(query.resourceReference).trim() : undefined,
      outcome: query.outcome ? String(query.outcome).trim() : undefined,
      fromDate: query.fromDate ? String(query.fromDate).trim() : undefined,
      toDate: query.toDate ? String(query.toDate).trim() : undefined,
      search: query.search ? String(query.search).trim() : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : 1000,
    });

    if (query.format === 'csv') {
      return this.formatCsv(items);
    }

    return items;
  }

  /**
   * Convert audit log items to safe CSV string
   */
  formatCsv(items) {
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Outcome',
      'Resource Type',
      'Resource ID',
      'Resource Reference',
      'Actor Name',
      'Actor Email',
      'Branch',
      'Warehouse',
      'Reason',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = items.map((i) => [
      escapeCsv(i.id),
      escapeCsv(i.created_at),
      escapeCsv(i.action),
      escapeCsv(i.outcome),
      escapeCsv(i.resource_type),
      escapeCsv(i.resource_id),
      escapeCsv(i.resource_reference),
      escapeCsv(i.actor_name),
      escapeCsv(i.actor_email),
      escapeCsv(i.branch_name),
      escapeCsv(i.warehouse_name),
      escapeCsv(i.reason),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export default new AuditService();
