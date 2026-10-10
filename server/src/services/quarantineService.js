import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import quarantineRepository from '../repositories/quarantineRepository.js';
import auditService from './auditService.js';
import notificationService from './notificationService.js';
import { getPool } from '../database/pool.js';

export class QuarantineService {
  async #resolveScope(userId) {
    const scope = await authorizationService.getUserScope(userId);
    return {
      organizationIds: [...scope.organizationIds],
      branchIds: [...scope.branchIds],
      warehouseIds: [...scope.warehouseIds],
    };
  }

  async #checkScope(userId, record) {
    const scope = await this.#resolveScope(userId);
    const orgMatch = scope.organizationIds.length === 0 || scope.organizationIds.includes(Number(record.organization_id));
    const branchMatch = scope.branchIds.length === 0 || scope.branchIds.includes(Number(record.branch_id));
    const whMatch = scope.warehouseIds.length === 0 || scope.warehouseIds.includes(Number(record.warehouse_id));

    if (!orgMatch || !branchMatch || !whMatch) {
      throw new AppError('You do not have access to this resource within your scope.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }
  }

  async listQuarantines(params, userId) {
    const scope = await this.#resolveScope(userId);
    return quarantineRepository.listQuarantines({
      organizationIds: scope.organizationIds,
      branchIds: scope.branchIds,
      warehouseIds: scope.warehouseIds,
      status: params.status,
      productId: params.productId ? Number(params.productId) : undefined,
      batchId: params.batchId ? Number(params.batchId) : undefined,
      search: params.search?.trim(),
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 20,
    });
  }

  async getQuarantineById(id, userId) {
    const qCase = await quarantineRepository.findById(id);
    if (!qCase) {
      throw new AppError('Quarantine case not found.', { statusCode: 404, code: 'NOT_FOUND' });
    }
    await this.#checkScope(userId, qCase);
    return qCase;
  }

  async createQuarantine(input, userId) {
    const branchId = Number(input.branchId);
    const warehouseId = Number(input.warehouseId);
    const storageLocationId = Number(input.storageLocationId);
    const productId = Number(input.productId);
    const batchId = Number(input.batchId);
    const unitId = Number(input.unitId);
    const quantity = Number(input.quantity);
    const reason = input.reason?.trim();
    const notes = input.notes?.trim();
    const sourceType = input.sourceType || 'manual';
    const sourceId = input.sourceId ? Number(input.sourceId) : null;

    if (!branchId || !warehouseId || !storageLocationId || !productId || !batchId || !unitId) {
      throw new ValidationError('Validation failed', [
        { field: 'location', message: 'Branch, warehouse, storage location, product, batch, and unit are required.' },
      ]);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Validation failed', [
        { field: 'quantity', message: 'Quarantine quantity must be a positive number.' },
      ]);
    }
    if (!reason) {
      throw new ValidationError('Validation failed', [
        { field: 'reason', message: 'A documented reason is required to quarantine stock.' },
      ]);
    }

    // Verify warehouse & branch exist and fetch organization ID
    const [whRows] = await getPool().query(
      `SELECT w.id, w.branch_id, b.organization_id, w.status AS wh_status, b.status AS br_status
       FROM warehouses w
       JOIN branches b ON b.id = w.branch_id
       WHERE w.id = ? AND w.branch_id = ?`,
      [warehouseId, branchId],
    );
    if (whRows.length === 0) {
      throw new AppError('Invalid warehouse or branch combination.', { statusCode: 400, code: 'INVALID_LOCATION' });
    }
    const orgId = whRows[0].organization_id;

    await this.#checkScope(userId, { organization_id: orgId, branch_id: branchId, warehouse_id: warehouseId });

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      const quarantineNumber = await quarantineRepository.generateQuarantineNumber(orgId, connection);

      // 1. Authoritative inventory state transition: 'available' -> 'quarantined'
      await inventoryService.transferInventoryStatus({
        organizationId: orgId,
        branchId,
        warehouseId,
        storageLocationId,
        productId,
        batchId,
        unitId,
        fromStatus: 'available',
        toStatus: 'quarantined',
        quantity,
        userId,
        reason: `Quarantine initiated: ${reason}`,
        referenceType: 'quarantine',
        referenceId: null,
        connection,
      });

      // 2. Persist quarantine case
      const caseId = await quarantineRepository.createQuarantine(
        {
          organizationId: orgId,
          branchId,
          warehouseId,
          storageLocationId,
          quarantineNumber,
          productId,
          batchId,
          unitId,
          quantity,
          sourceType,
          sourceId,
          reason,
          notes,
          status: 'quarantined',
          createdBy: userId,
        },
        connection,
      );

      await auditService.log({
        organizationId: orgId,
        branchId,
        warehouseId,
        actorUserId: userId,
        action: 'quarantine.created',
        resourceType: 'quarantine_case',
        resourceId: caseId,
        resourceReference: quarantineNumber,
        reason,
        details: { productId, batchId, quantity },
      }, connection);

      await notificationService.notifyByPermission({
        organizationId: orgId,
        branchId,
        warehouseId,
        permission: 'quarantine.view',
        type: 'quarantine_alert',
        title: 'New Quarantine Hold',
        message: `Quarantine hold ${quarantineNumber} created for ${quantity} units. Reason: ${reason}`,
        severity: 'danger',
        resourceType: 'quarantine_case',
        resourceId: caseId,
        resourceReference: quarantineNumber,
        actionUrl: `/inventory/quarantines/${caseId}`,
        dedupKey: `quarantine:created:${caseId}`,
        connection,
      });

      await connection.commit();
      return this.getQuarantineById(caseId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async reviewQuarantine(id, { reviewNotes }, userId) {
    const qCase = await this.getQuarantineById(id, userId);

    if (qCase.status !== 'quarantined') {
      throw new AppError(`Cannot review quarantine case in status '${qCase.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    await quarantineRepository.updateQuarantine(id, {
      status: 'under_review',
      reviewed_by: userId,
      reviewed_at: new Date(),
      review_notes: reviewNotes?.trim() || null,
    });

    return this.getQuarantineById(id, userId);
  }

  async releaseQuarantine(id, { releaseNotes }, userId) {
    const qCase = await this.getQuarantineById(id, userId);

    if (!['quarantined', 'under_review'].includes(qCase.status)) {
      throw new AppError(`Cannot release quarantine case in status '${qCase.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    if (!releaseNotes?.trim()) {
      throw new ValidationError('Validation failed', [
        { field: 'releaseNotes', message: 'Release notes and documented justification are required.' },
      ]);
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      // Authoritative release check & stock transition (fails if expired or active recall!)
      await inventoryService.releaseQuarantineStock({
        organizationId: qCase.organization_id,
        branchId: qCase.branch_id,
        warehouseId: qCase.warehouse_id,
        storageLocationId: qCase.storage_location_id,
        productId: qCase.product_id,
        batchId: qCase.batch_id,
        unitId: qCase.unit_id,
        quantity: Number(qCase.quantity),
        userId,
        reason: releaseNotes.trim(),
        referenceId: qCase.id,
        connection,
      });

      await quarantineRepository.updateQuarantine(
        id,
        {
          status: 'released',
          released_by: userId,
          released_at: new Date(),
          release_notes: releaseNotes.trim(),
        },
        connection,
      );

      await auditService.log({
        organizationId: qCase.organization_id,
        branchId: qCase.branch_id,
        warehouseId: qCase.warehouse_id,
        actorUserId: userId,
        action: 'quarantine.released',
        resourceType: 'quarantine_case',
        resourceId: qCase.id,
        resourceReference: qCase.quarantine_number,
        reason: releaseNotes.trim(),
        details: { quantity: Number(qCase.quantity) },
      }, connection);

      await connection.commit();
      return this.getQuarantineById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async disposeQuarantine(id, { disposalMethod, disposalNotes }, userId) {
    const qCase = await this.getQuarantineById(id, userId);

    if (!['quarantined', 'under_review'].includes(qCase.status)) {
      throw new AppError(`Cannot dispose of stock from quarantine case in status '${qCase.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    if (!disposalNotes?.trim()) {
      throw new ValidationError('Validation failed', [
        { field: 'disposalNotes', message: 'Documented justification is required for stock disposal.' },
      ]);
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      // Authoritative physical stock reduction & append-only stock movement
      await inventoryService.disposeStock({
        organizationId: qCase.organization_id,
        branchId: qCase.branch_id,
        warehouseId: qCase.warehouse_id,
        storageLocationId: qCase.storage_location_id,
        productId: qCase.product_id,
        batchId: qCase.batch_id,
        unitId: qCase.unit_id,
        fromStatus: 'quarantined',
        quantity: Number(qCase.quantity),
        userId,
        reason: disposalNotes.trim(),
        disposalMethod: disposalMethod?.trim() || 'Incineration / Destructive Disposal',
        referenceType: 'quarantine',
        referenceId: qCase.id,
        connection,
      });

      await quarantineRepository.updateQuarantine(
        id,
        {
          status: 'disposed',
          disposed_by: userId,
          disposed_at: new Date(),
          disposal_notes: disposalNotes.trim(),
          disposal_method: disposalMethod?.trim() || 'Incineration / Destructive Disposal',
        },
        connection,
      );

      await auditService.log({
        organizationId: qCase.organization_id,
        branchId: qCase.branch_id,
        warehouseId: qCase.warehouse_id,
        actorUserId: userId,
        action: 'quarantine.disposed',
        resourceType: 'quarantine_case',
        resourceId: qCase.id,
        resourceReference: qCase.quarantine_number,
        reason: disposalNotes.trim(),
        details: { disposalMethod: disposalMethod?.trim(), quantity: Number(qCase.quantity) },
      }, connection);

      await connection.commit();
      return this.getQuarantineById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async cancelQuarantine(id, { cancellationReason }, userId) {
    const qCase = await this.getQuarantineById(id, userId);

    if (['released', 'disposed', 'cancelled'].includes(qCase.status)) {
      throw new AppError(`Cannot cancel quarantine case in status '${qCase.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      // If stock was moved to quarantined, attempt safe reversal
      if (['quarantined', 'under_review'].includes(qCase.status)) {
        await inventoryService.releaseQuarantineStock({
          organizationId: qCase.organization_id,
          branchId: qCase.branch_id,
          warehouseId: qCase.warehouse_id,
          storageLocationId: qCase.storage_location_id,
          productId: qCase.product_id,
          batchId: qCase.batch_id,
          unitId: qCase.unit_id,
          quantity: Number(qCase.quantity),
          userId,
          reason: `Quarantine cancelled: ${cancellationReason || 'Hold cancelled'}`,
          referenceId: qCase.id,
          connection,
        });
      }

      await quarantineRepository.updateQuarantine(
        id,
        {
          status: 'cancelled',
          cancelled_by: userId,
          cancelled_at: new Date(),
          cancellation_reason: cancellationReason?.trim() || 'Cancelled by authorized user',
        },
        connection,
      );

      await connection.commit();
      return this.getQuarantineById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

export default new QuarantineService();
