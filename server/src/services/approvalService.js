/**
 * Task 18 — Centralized Approvals and Authorized Overrides Service
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import crypto from 'node:crypto';
import approvalRepository from '../repositories/approvalRepository.js';
import authorizationService from './authorizationService.js';
import auditService from './auditService.js';
import { getPool } from '../database/pool.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import logger from '../utils/logger.js';

// Default policy rules per category if not customized in approval_policies table
const DEFAULT_POLICIES = {
  sale_discount: {
    category: 'sale_discount',
    name: 'Sales Discount Override',
    threshold_value: 15.00, // % discount limit
    required_permission: 'approval.discount',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  credit_limit_override: {
    category: 'credit_limit_override',
    name: 'Customer Credit Limit Override',
    threshold_value: 0.00, // Any excess requires approval
    required_permission: 'approval.credit',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  stock_adjustment: {
    category: 'stock_adjustment',
    name: 'Stock Count Variance Adjustment',
    threshold_value: 0.00,
    required_permission: 'approval.inventory',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  quarantine_release: {
    category: 'quarantine_release',
    name: 'Quarantine Hold Release',
    threshold_value: null,
    required_permission: 'approval.quarantine',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  recall_closure: {
    category: 'recall_closure',
    name: 'Product Recall Closure',
    threshold_value: null,
    required_permission: 'approval.quarantine',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  price_change: {
    category: 'price_change',
    name: 'Product Selling Price Change',
    threshold_value: 0.00,
    required_permission: 'approval.discount',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
  purchase_order: {
    category: 'purchase_order',
    name: 'Purchase Order Approval',
    threshold_value: 50000.00,
    required_permission: 'approval.procurement',
    require_separation_of_duties: 1,
    auto_execute_on_approval: 0,
  },
};

class ApprovalService {
  /**
   * Resolve applicable policy (customized from DB, or default fallback)
   */
  async getEffectivePolicy(organizationId, category, connection = null) {
    const dbPolicy = await approvalRepository.findPolicyByCategory(organizationId, category, connection);
    if (dbPolicy) return dbPolicy;
    return DEFAULT_POLICIES[category] || null;
  }

  /**
   * Determine whether an operation requires an approval request based on policy
   */
  async checkApprovalRequired({ organizationId, category, requestedValue, originalValue, context }) {
    const policy = await this.getEffectivePolicy(organizationId, category);
    if (!policy) return { required: false };

    if (category === 'sale_discount') {
      const discountPercent = Number(requestedValue || 0);
      const threshold = Number(policy.threshold_value ?? 15.00);
      if (discountPercent > threshold) {
        return {
          required: true,
          reason: `Discount (${discountPercent}%) exceeds standard limit (${threshold}%). Approval required.`,
          policy,
        };
      }
    }

    if (category === 'credit_limit_override') {
      const projectedBalance = Number(requestedValue || 0);
      const limit = Number(originalValue || 0);
      if (projectedBalance > limit) {
        return {
          required: true,
          reason: `Projected balance (${projectedBalance} ETB) exceeds customer credit limit (${limit} ETB). Approval required.`,
          policy,
        };
      }
    }

    return { required: false, policy };
  }

  /**
   * Helper to resolve accessible organizations and branches for a user
   */
  async getUserAccessibleScopes(userId, connection = null) {
    const scope = await authorizationService.getUserScope(userId);
    const orgIds = new Set(scope.organizationIds);
    if (scope.branchIds.size > 0) {
      const runner = connection || (await approvalRepository.getPool());
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
    };
  }

  /**
   * Generate unique request number APR-YYYY-XXXX
   */
  generateRequestNumber() {
    const year = new Date().getFullYear();
    const rand = crypto.randomInt(1000, 9999);
    return `APR-${year}-${rand}`;
  }

  /**
   * Create an approval request
   */
  async createRequest(data, user) {
    const {
      organizationId,
      branchId = null,
      category,
      targetEntityType,
      targetEntityId,
      targetReference = null,
      requestedValue = null,
      originalValue = null,
      reason,
      notes = null,
      snapshotData = null,
    } = data;

    if (!organizationId || !category || !targetEntityType || !targetEntityId || !reason) {
      throw new ValidationError('Validation failed', [
        { field: 'category', message: 'Category, target entity, and reason are required' },
      ]);
    }

    // Verify scope: user cannot create for an organization outside their scope
    const userScope = await this.getUserAccessibleScopes(user.id);
    if (!userScope.organizationIds.has(Number(organizationId))) {
      throw new AppError('Forbidden: Organization is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }
    if (branchId && userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(organizationId))) {
      if (!userScope.branchIds.has(Number(branchId))) {
        throw new AppError('Forbidden: Branch is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
    }

    const policy = await this.getEffectivePolicy(organizationId, category);
    const requestNumber = this.generateRequestNumber();

    // Generate fingerprint of snapshot data to detect stale alterations later
    const staleFingerprint = snapshotData ? crypto.createHash('sha256').update(JSON.stringify(snapshotData)).digest('hex') : null;

    const pool = await approvalRepository.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const requestId = await approvalRepository.createRequest({
        requestNumber,
        organizationId,
        branchId,
        category,
        policyId: policy?.id || null,
        requesterId: user.id,
        targetEntityType,
        targetEntityId,
        targetReference,
        requestedValue,
        originalValue,
        reason,
        notes,
        snapshotData,
        staleFingerprint,
      }, connection);

      await approvalRepository.recordHistory({
        approvalRequestId: requestId,
        action: 'created',
        actorId: user.id,
        notes: `Approval request created: ${reason}`,
        payload: { requestedValue, originalValue },
      }, connection);

      await auditService.log({
        organizationId,
        branchId,
        actorUserId: user.id,
        action: 'approval.created',
        resourceType: 'approval_request',
        resourceId: requestId,
        resourceReference: requestNumber,
        reason,
        details: { category, requestedValue, originalValue, targetEntityType, targetEntityId },
      }, connection);

      await connection.commit();

      logger.info('Approval request created', {
        requestId,
        requestNumber,
        category,
        requesterId: user.id,
        organizationId,
      });

      return approvalRepository.getRequestById(requestId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * List approval requests with scope enforcement and filters
   */
  async listRequests(query, user) {
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
      branchIds = [...userScope.branchIds];
    } else if (query.branchId) {
      branchIds = [parseInt(query.branchId, 10)];
    }

    return approvalRepository.listRequests({
      organizationId: orgId,
      branchIds,
      category: query.category || undefined,
      status: query.status || undefined,
      requesterId: query.requesterId ? parseInt(query.requesterId, 10) : undefined,
      targetEntityType: query.targetEntityType || undefined,
      targetEntityId: query.targetEntityId ? parseInt(query.targetEntityId, 10) : undefined,
      search: query.search ? String(query.search).trim() : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  /**
   * Get single approval request by ID with history
   */
  async getRequestById(id, user) {
    const request = await approvalRepository.getRequestById(id);
    if (!request) {
      throw new AppError('Approval request not found', { statusCode: 404, code: 'NOT_FOUND' });
    }

    const userScope = await this.getUserAccessibleScopes(user.id);
    if (!userScope.organizationIds.has(Number(request.organization_id))) {
      throw new AppError('Forbidden: Approval request is out of organization scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    if (request.branch_id && userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(request.organization_id))) {
      if (!userScope.branchIds.has(Number(request.branch_id))) {
        throw new AppError('Forbidden: Approval request is out of branch scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
    }

    const history = await approvalRepository.getHistoryByRequestId(id);
    return {
      ...request,
      history,
    };
  }

  /**
   * Approve an approval request
   */
  async approveRequest(id, { decisionReason = 'Approved' } = {}, user) {
    const pool = await approvalRepository.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const request = await approvalRepository.getRequestForUpdate(id, connection);
      if (!request) {
        throw new AppError('Approval request not found', { statusCode: 404, code: 'NOT_FOUND' });
      }

      if (request.status !== 'pending') {
        throw new AppError(`Cannot approve request in '${request.status}' status. Only pending requests can be approved.`, {
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      // Check organization scope
      const userScope = await this.getUserAccessibleScopes(user.id, connection);
      if (!userScope.organizationIds.has(Number(request.organization_id))) {
        throw new AppError('Forbidden: Request outside organization scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
      if (request.branch_id && userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(request.organization_id))) {
        if (!userScope.branchIds.has(Number(request.branch_id))) {
          throw new AppError('Forbidden: Request outside branch scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
        }
      }

      // Check Separation of Duties: Requester cannot approve their own request unless configured otherwise
      const policy = await this.getEffectivePolicy(request.organization_id, request.category, connection);
      const requireSoD = policy ? Boolean(policy.require_separation_of_duties) : true;

      if (requireSoD && Number(request.requester_id) === Number(user.id)) {
        throw new AppError('Forbidden: Separation of duties violation. A user cannot approve their own request.', {
          statusCode: 403,
          code: 'SELF_APPROVAL_PROHIBITED',
        });
      }

      // Check Approver Authority Permission
      const requiredPerm = policy?.required_permission || DEFAULT_POLICIES[request.category]?.required_permission || 'approval.execute';
      const userPermissions = await authorizationService.getUserPermissions(user.id);
      const hasAuthority = userPermissions.includes('*') || userPermissions.includes(requiredPerm) || userPermissions.includes('approval.execute');

      if (!hasAuthority) {
        throw new AppError(`Forbidden: User lacks required approval authority permission '${requiredPerm}'`, {
          statusCode: 403,
          code: 'INSUFFICIENT_APPROVAL_AUTHORITY',
        });
      }

      // Revalidate Stale Data Fingerprint
      if (request.snapshot_data && request.stale_fingerprint) {
        const isStale = await this.revalidateTargetEntity(request, connection);
        if (isStale) {
          await approvalRepository.updateStatus(id, {
            status: 'expired',
            decisionReason: 'Request invalidated: underlying target record was altered after request creation.',
            decisionAt: new Date(),
          }, connection);

          await approvalRepository.recordHistory({
            approvalRequestId: id,
            action: 'invalidated',
            actorId: user.id,
            notes: 'Request automatically marked expired due to stale data mismatch',
          }, connection);

          await connection.commit();
          throw new AppError('Underlying target record was modified after request submission. Approval request invalidated.', {
            statusCode: 409,
            code: 'STALE_REQUEST_DATA',
          });
        }
      }

      const decisionAt = new Date();
      await approvalRepository.updateStatus(id, {
        status: 'approved',
        approverId: user.id,
        decisionReason: decisionReason || 'Approved',
        decisionAt,
      }, connection);

      await approvalRepository.recordHistory({
        approvalRequestId: id,
        action: 'approved',
        actorId: user.id,
        notes: decisionReason || 'Approved',
        payload: { approverId: user.id, decisionAt },
      }, connection);

      await auditService.log({
        organizationId: request.organization_id,
        branchId: request.branch_id,
        actorUserId: user.id,
        action: 'approval.approved',
        resourceType: 'approval_request',
        resourceId: id,
        resourceReference: request.request_number,
        reason: decisionReason || 'Approved',
        details: { category: request.category },
      }, connection);

      await connection.commit();

      logger.info('Approval request approved', {
        requestId: id,
        requestNumber: request.request_number,
        approverId: user.id,
      });

      return approvalRepository.getRequestById(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Reject an approval request
   */
  async rejectRequest(id, { decisionReason }, user) {
    if (!decisionReason || !String(decisionReason).trim()) {
      throw new ValidationError('Validation failed', [
        { field: 'decisionReason', message: 'Rejection reason is mandatory' },
      ]);
    }

    const pool = await approvalRepository.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const request = await approvalRepository.getRequestForUpdate(id, connection);
      if (!request) {
        throw new AppError('Approval request not found', { statusCode: 404, code: 'NOT_FOUND' });
      }

      if (request.status !== 'pending') {
        throw new AppError(`Cannot reject request in '${request.status}' status. Only pending requests can be rejected.`, {
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      const userScope = await this.getUserAccessibleScopes(user.id, connection);
      if (!userScope.organizationIds.has(Number(request.organization_id))) {
        throw new AppError('Forbidden: Request outside organization scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
      }
      if (request.branch_id && userScope.branchIds.size > 0 && !userScope.explicitOrgIds.has(Number(request.organization_id))) {
        if (!userScope.branchIds.has(Number(request.branch_id))) {
          throw new AppError('Forbidden: Request outside branch scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
        }
      }

      const policy = await this.getEffectivePolicy(request.organization_id, request.category, connection);
      const requiredPerm = policy?.required_permission || DEFAULT_POLICIES[request.category]?.required_permission || 'approval.execute';
      const userPermissions = await authorizationService.getUserPermissions(user.id);
      const hasAuthority = userPermissions.includes('*') || userPermissions.includes(requiredPerm) || userPermissions.includes('approval.execute');

      if (!hasAuthority) {
        throw new AppError(`Forbidden: User lacks required approval authority permission '${requiredPerm}'`, {
          statusCode: 403,
          code: 'INSUFFICIENT_APPROVAL_AUTHORITY',
        });
      }

      const decisionAt = new Date();
      await approvalRepository.updateStatus(id, {
        status: 'rejected',
        approverId: user.id,
        decisionReason: decisionReason.trim(),
        decisionAt,
      }, connection);

      await approvalRepository.recordHistory({
        approvalRequestId: id,
        action: 'rejected',
        actorId: user.id,
        notes: decisionReason.trim(),
        payload: { approverId: user.id, decisionAt },
      }, connection);

      await auditService.log({
        organizationId: request.organization_id,
        branchId: request.branch_id,
        actorUserId: user.id,
        action: 'approval.rejected',
        resourceType: 'approval_request',
        resourceId: id,
        resourceReference: request.request_number,
        reason: decisionReason.trim(),
        details: { category: request.category },
      }, connection);

      await connection.commit();

      logger.info('Approval request rejected', {
        requestId: id,
        requestNumber: request.request_number,
        approverId: user.id,
        reason: decisionReason,
      });

      return approvalRepository.getRequestById(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Cancel an approval request by requester
   */
  async cancelRequest(id, { cancelReason = 'Cancelled by requester' } = {}, user) {
    const pool = await approvalRepository.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const request = await approvalRepository.getRequestForUpdate(id, connection);
      if (!request) {
        throw new AppError('Approval request not found', { statusCode: 404, code: 'NOT_FOUND' });
      }

      if (request.status !== 'pending') {
        throw new AppError(`Cannot cancel request in '${request.status}' status.`, {
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }

      // Requester or admin with approval.cancel
      const userPermissions = await authorizationService.getUserPermissions(user.id);
      const isRequester = Number(request.requester_id) === Number(user.id);
      const hasCancelPerm = userPermissions.includes('*') || userPermissions.includes('approval.cancel');

      if (!isRequester && !hasCancelPerm) {
        throw new AppError('Forbidden: Only the requester or an administrator can cancel this request.', {
          statusCode: 403,
          code: 'UNAUTHORIZED_CANCELLATION',
        });
      }

      await approvalRepository.updateStatus(id, {
        status: 'cancelled',
        decisionReason: cancelReason || 'Cancelled by requester',
      }, connection);

      await approvalRepository.recordHistory({
        approvalRequestId: id,
        action: 'cancelled',
        actorId: user.id,
        notes: cancelReason || 'Cancelled by requester',
      }, connection);

      await auditService.log({
        organizationId: request.organization_id,
        branchId: request.branch_id,
        actorUserId: user.id,
        action: 'approval.cancelled',
        resourceType: 'approval_request',
        resourceId: id,
        resourceReference: request.request_number,
        reason: cancelReason || 'Cancelled by requester',
        details: { category: request.category },
      }, connection);

      await connection.commit();

      return approvalRepository.getRequestById(id);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Revalidate target entity to protect against stale requests
   */
  async revalidateTargetEntity(request, connection) {
    if (!request.snapshot_data) return false;

    try {
      const snapshot = typeof request.snapshot_data === 'string'
        ? JSON.parse(request.snapshot_data)
        : request.snapshot_data;

      if (request.target_entity_type === 'sale') {
        const [rows] = await connection.query(
          'SELECT subtotal, discount_amount, total_amount, status FROM sales WHERE id = ?',
          [request.target_entity_id],
        );
        const sale = rows[0];
        if (!sale) return true; // Target deleted -> stale
        if (snapshot.subtotal !== undefined && Number(sale.subtotal) !== Number(snapshot.subtotal)) return true;
        if (snapshot.discountAmount !== undefined && Number(sale.discount_amount) !== Number(snapshot.discountAmount)) return true;
      }

      if (request.target_entity_type === 'customer') {
        const [rows] = await connection.query(
          'SELECT credit_limit, status FROM customers WHERE id = ?',
          [request.target_entity_id],
        );
        const customer = rows[0];
        if (!customer) return true;
        if (snapshot.creditLimit !== undefined && Number(customer.credit_limit) !== Number(snapshot.creditLimit)) return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verify and consume an approved request for an operation
   */
  async verifyAndConsumeApprovedRequest({
    organizationId,
    category,
    targetEntityType,
    targetEntityId,
    expectedValue = null,
    connection,
  }) {
    const approvedRequest = await approvalRepository.findApprovedRequestForTarget(
      organizationId,
      category,
      targetEntityType,
      targetEntityId,
      connection,
    );

    if (!approvedRequest) {
      return { approved: false };
    }

    if (approvedRequest.status === 'executed') {
      return { approved: true, request: approvedRequest, alreadyExecuted: true };
    }

    if (expectedValue !== null && approvedRequest.requested_value !== null) {
      if (Number(expectedValue) > Number(approvedRequest.requested_value)) {
        throw new AppError(
          `Requested value (${expectedValue}) exceeds authorized approved value (${approvedRequest.requested_value}). Renewed approval required.`,
          { statusCode: 409, code: 'APPROVAL_LIMIT_EXCEEDED' },
        );
      }
    }

    // Mark request as executed
    await approvalRepository.updateStatus(approvedRequest.id, {
      status: 'executed',
      executedAt: new Date(),
    }, connection);

    await approvalRepository.recordHistory({
      approvalRequestId: approvedRequest.id,
      action: 'executed',
      actorId: approvedRequest.requester_id,
      notes: `Approved override executed for ${targetEntityType} #${targetEntityId}`,
    }, connection);

    await auditService.log({
      organizationId: approvedRequest.organization_id,
      branchId: approvedRequest.branch_id,
      actorUserId: approvedRequest.requester_id,
      action: 'approval.executed',
      resourceType: 'approval_request',
      resourceId: approvedRequest.id,
      resourceReference: approvedRequest.request_number,
      reason: `Approved override executed for ${targetEntityType} #${targetEntityId}`,
      details: { category: approvedRequest.category, targetEntityType, targetEntityId },
    }, connection);

    return { approved: true, request: approvedRequest };
  }

  /**
   * Policies management
   */
  async listPolicies(user) {
    const userScope = await this.getUserAccessibleScopes(user.id);
    const orgId = [...userScope.organizationIds][0] || user.organization_id;
    return approvalRepository.listPolicies(orgId);
  }

  async upsertPolicy(data, user) {
    const userScope = await this.getUserAccessibleScopes(user.id);
    const orgId = data.organizationId ? Number(data.organizationId) : [...userScope.organizationIds][0] || user.organization_id;
    if (!userScope.organizationIds.has(Number(orgId))) {
      throw new AppError('Forbidden: Organization is out of user scope', { statusCode: 403, code: 'SCOPE_FORBIDDEN' });
    }

    if (!data.category || !data.name || !data.requiredPermission) {
      throw new ValidationError('Validation failed', [
        { field: 'category', message: 'Category, name, and requiredPermission are required' },
      ]);
    }

    await approvalRepository.upsertPolicy({
      organizationId: orgId,
      category: data.category,
      name: data.name,
      description: data.description || null,
      thresholdValue: data.thresholdValue !== undefined ? Number(data.thresholdValue) : null,
      requiredPermission: data.requiredPermission,
      requireSeparationOfDuties: data.requireSeparationOfDuties !== undefined ? (data.requireSeparationOfDuties ? 1 : 0) : 1,
      autoExecuteOnApproval: data.autoExecuteOnApproval ? 1 : 0,
      isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
    });

    return approvalRepository.findPolicyByCategory(orgId, data.category);
  }
}

export default new ApprovalService();
