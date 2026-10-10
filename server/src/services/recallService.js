import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import recallRepository from '../repositories/recallRepository.js';
import auditService from './auditService.js';
import notificationService from './notificationService.js';
import { getPool } from '../database/pool.js';

export class RecallService {
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

    if (!orgMatch) {
      throw new AppError('You do not have access to this recall case within your organization scope.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }
  }

  async listRecalls(params, userId) {
    const scope = await this.#resolveScope(userId);
    return recallRepository.listRecalls({
      organizationIds: scope.organizationIds,
      status: params.status,
      severity: params.severity,
      productId: params.productId ? Number(params.productId) : undefined,
      search: params.search?.trim(),
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 20,
    });
  }

  async getRecallById(id, userId) {
    const recall = await recallRepository.findById(id);
    if (!recall) {
      throw new AppError('Product recall case not found.', { statusCode: 404, code: 'NOT_FOUND' });
    }
    await this.#checkScope(userId, recall);

    const [batches, actions, traceability] = await Promise.all([
      recallRepository.getRecallBatches(id),
      recallRepository.getRecallActions(id),
      recallRepository.getAffectedStockTraceability(id),
    ]);

    return {
      ...recall,
      batches,
      actions,
      traceability,
    };
  }

  async createRecall(input, userId) {
    const productId = Number(input.productId);
    const title = input.title?.trim();
    const description = input.description?.trim();
    const reasonCategory = input.reasonCategory?.trim();
    const initiatingParty = input.initiatingParty?.trim();
    const severity = input.severity || 'class_2';
    const scopeLevel = input.scopeLevel || 'batch';
    const effectiveDate = input.effectiveDate || new Date().toISOString().split('T')[0];
    const batchIds = Array.isArray(input.batchIds) ? input.batchIds.map(Number) : [];

    if (!productId || !title || !description || !reasonCategory || !initiatingParty) {
      throw new ValidationError('Validation failed', [
        { field: 'required', message: 'Title, description, reason category, initiating party, and product are required.' },
      ]);
    }

    if (scopeLevel === 'batch' && batchIds.length === 0) {
      throw new ValidationError('Validation failed', [
        { field: 'batchIds', message: 'At least one affected batch must be selected for a batch-level recall.' },
      ]);
    }

    // Fetch product to verify and get organizationId
    const [pRows] = await getPool().query(
      'SELECT id, organization_id, name, code, status FROM products WHERE id = ?',
      [productId],
    );
    const product = pRows[0];
    if (!product) {
      throw new AppError('Product not found.', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
    }

    await this.#checkScope(userId, { organization_id: product.organization_id });

    // If product scope, fetch all batches of the product
    let resolvedBatchIds = batchIds;
    if (scopeLevel === 'product') {
      const [allBatches] = await getPool().query(
        'SELECT id FROM batches WHERE product_id = ?',
        [productId],
      );
      resolvedBatchIds = allBatches.map((b) => b.id);
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      const recallNumber = await recallRepository.generateRecallNumber(product.organization_id, connection);

      const recallId = await recallRepository.createRecall(
        {
          organizationId: product.organization_id,
          recallNumber,
          title,
          description,
          reasonCategory,
          initiatingParty,
          severity,
          scopeLevel,
          productId,
          status: 'draft',
          effectiveDate,
          createdBy: userId,
        },
        connection,
      );

      if (resolvedBatchIds.length > 0) {
        await recallRepository.addRecallBatches(recallId, resolvedBatchIds, connection);
      }

      await auditService.log({
        organizationId: product.organization_id,
        actorUserId: userId,
        action: 'recall.created',
        resourceType: 'recall_case',
        resourceId: recallId,
        resourceReference: recallNumber,
        reason: title,
        details: { severity, scopeLevel, productId, batchCount: resolvedBatchIds.length },
      }, connection);

      await connection.commit();
      return this.getRecallById(recallId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async approveRecall(id, { approvalNotes }, userId) {
    const recall = await this.getRecallById(id, userId);

    if (recall.status !== 'draft') {
      throw new AppError(`Cannot approve recall case in status '${recall.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    await recallRepository.updateRecall(id, {
      status: 'under_review',
      approved_by: userId,
      approved_at: new Date(),
      approval_notes: approvalNotes?.trim() || null,
    });

    await auditService.log({
      organizationId: recall.organization_id,
      actorUserId: userId,
      action: 'recall.approved',
      resourceType: 'recall_case',
      resourceId: id,
      resourceReference: recall.recall_number,
      reason: approvalNotes?.trim() || 'Recall approved by supervisor',
    }).catch(() => {});

    return this.getRecallById(id, userId);
  }

  async activateRecall(id, userId) {
    const recall = await this.getRecallById(id, userId);

    if (!['draft', 'under_review'].includes(recall.status)) {
      throw new AppError(`Cannot activate recall in status '${recall.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    const batchIds = (recall.batches || []).map((b) => b.batch_id);
    if (batchIds.length === 0) {
      throw new AppError('Cannot activate recall: no affected batches linked.', {
        statusCode: 400,
        code: 'NO_BATCHES',
      });
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      // 1. Deactivate affected batches to block any new allocations
      await connection.query(
        `UPDATE batches SET status = 'inactive' WHERE id IN (${batchIds.map(() => '?').join(',')})`,
        batchIds,
      );

      // 2. Locate available on-hand stock across warehouses and move to 'recalled' status
      const [availableStockRows] = await connection.query(
        `SELECT id, branch_id, warehouse_id, storage_location_id,
                product_id, batch_id, unit_id, quantity
         FROM inventory
         WHERE batch_id IN (${batchIds.map(() => '?').join(',')})
           AND status = 'available'
           AND quantity > 0
         FOR UPDATE`,
        batchIds,
      );

      let totalContained = 0;
      for (const row of availableStockRows) {
        const qty = Number(row.quantity);
        await inventoryService.transferInventoryStatus({
          organizationId: recall.organization_id,
          branchId: row.branch_id,
          warehouseId: row.warehouse_id,
          storageLocationId: row.storage_location_id,
          productId: row.product_id,
          batchId: row.batch_id,
          unitId: row.unit_id,
          fromStatus: 'available',
          toStatus: 'recalled',
          quantity: qty,
          userId,
          reason: `Product recall activation: ${recall.recall_number} (${recall.title})`,
          referenceType: 'recall',
          referenceId: recall.id,
          connection,
        });
        totalContained += qty;
      }

      // 3. Record containment action in recall log
      await recallRepository.addAction(
        {
          recallId: recall.id,
          actionType: 'quarantine_hold',
          quantity: totalContained,
          notes: `Recall activated by supervisor. All ${batchIds.length} batch(es) inactivated; ${totalContained} available units across ${availableStockRows.length} inventory positions moved to 'recalled' containment hold.`,
          recordedBy: userId,
        },
        connection,
      );

      // 4. Update recall case status to active
      await recallRepository.updateRecall(
        recall.id,
        {
          status: 'active',
          activated_by: userId,
          activated_at: new Date(),
        },
        connection,
      );

      await auditService.log({
        organizationId: recall.organization_id,
        actorUserId: userId,
        action: 'recall.activated',
        resourceType: 'recall_case',
        resourceId: recall.id,
        resourceReference: recall.recall_number,
        reason: `Activated recall containment: ${totalContained} units held`,
        details: { totalContained, batchCount: batchIds.length },
      }, connection);

      await notificationService.notifyByPermission({
        organizationId: recall.organization_id,
        permission: 'recall.view',
        type: 'recall_alert',
        title: `Product Recall Activated: ${recall.recall_number}`,
        message: `Product recall ${recall.recall_number} is now active. ${totalContained} units contained across batches.`,
        severity: 'danger',
        resourceType: 'recall_case',
        resourceId: recall.id,
        resourceReference: recall.recall_number,
        actionUrl: `/inventory/recalls/${recall.id}`,
        dedupKey: `recall:activated:${recall.id}`,
        connection,
      });

      await connection.commit();
      return this.getRecallById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async recordAction(id, input, userId) {
    const recall = await this.getRecallById(id, userId);

    if (!['active', 'monitoring'].includes(recall.status)) {
      throw new AppError(`Cannot record actions for recall in status '${recall.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    const actionType = input.actionType;
    const notes = input.notes?.trim();
    const branchId = input.branchId ? Number(input.branchId) : null;
    const warehouseId = input.warehouseId ? Number(input.warehouseId) : null;
    const batchId = input.batchId ? Number(input.batchId) : null;
    const quantity = Number(input.quantity) || 0;

    if (!actionType || !notes) {
      throw new ValidationError('Validation failed', [
        { field: 'notes', message: 'Action type and explanatory notes are required.' },
      ]);
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      // If disposal action is selected, perform physical stock write-off
      if (actionType === 'disposal') {
        if (!warehouseId || !batchId || quantity <= 0) {
          throw new ValidationError('Validation failed', [
            { field: 'disposal', message: 'Warehouse, batch, and positive quantity are required to record disposal.' },
          ]);
        }

        // Fetch storage location and unit
        const [invRows] = await connection.query(
          `SELECT storage_location_id, unit_id FROM inventory
           WHERE warehouse_id = ? AND batch_id = ? AND status IN ('recalled', 'quarantined') AND quantity >= ?
           LIMIT 1`,
          [warehouseId, batchId, quantity],
        );

        if (invRows.length === 0) {
          throw new AppError('Insufficient recalled or quarantined stock in warehouse to dispose.', {
            statusCode: 409,
            code: 'INSUFFICIENT_STOCK',
          });
        }

        await inventoryService.disposeStock({
          organizationId: recall.organization_id,
          branchId,
          warehouseId,
          storageLocationId: invRows[0].storage_location_id,
          productId: recall.product_id,
          batchId,
          unitId: invRows[0].unit_id,
          fromStatus: 'recalled',
          quantity,
          userId,
          reason: `Product Recall Disposal: ${recall.recall_number} — ${notes}`,
          disposalMethod: 'Regulatory recall destruction',
          referenceType: 'recall',
          referenceId: recall.id,
          connection,
        });
      }

      await recallRepository.addAction(
        {
          recallId: recall.id,
          actionType,
          branchId,
          warehouseId,
          batchId,
          quantity,
          referenceType: input.referenceType || null,
          referenceId: input.referenceId ? Number(input.referenceId) : null,
          notes,
          recordedBy: userId,
        },
        connection,
      );

      await connection.commit();
      return this.getRecallById(id, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async closeRecall(id, { resolutionNotes }, userId) {
    const recall = await this.getRecallById(id, userId);

    if (!['active', 'monitoring'].includes(recall.status)) {
      throw new AppError(`Cannot close recall in status '${recall.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    if (!resolutionNotes?.trim()) {
      throw new ValidationError('Validation failed', [
        { field: 'resolutionNotes', message: 'Comprehensive resolution notes are required to close a recall.' },
      ]);
    }

    // Check if there is still unconcealed available stock
    const traceability = recall.traceability || {};
    if (traceability.availableOnHand > 0) {
      throw new AppError(
        `Cannot close recall: there are still ${traceability.availableOnHand} available units of recalled batches across warehouses that have not been quarantined or disposed.`,
        { statusCode: 409, code: 'UNRESOLVED_AVAILABLE_STOCK' },
      );
    }

    await recallRepository.updateRecall(id, {
      status: 'resolved',
      resolved_by: userId,
      resolved_at: new Date(),
      resolution_notes: resolutionNotes.trim(),
    });

    await auditService.log({
      organizationId: recall.organization_id,
      actorUserId: userId,
      action: 'recall.closed',
      resourceType: 'recall_case',
      resourceId: id,
      resourceReference: recall.recall_number,
      reason: resolutionNotes.trim(),
    }).catch(() => {});

    return this.getRecallById(id, userId);
  }

  async cancelRecall(id, { cancellationReason }, userId) {
    const recall = await this.getRecallById(id, userId);

    if (['resolved', 'cancelled'].includes(recall.status)) {
      throw new AppError(`Cannot cancel recall in status '${recall.status}'.`, {
        statusCode: 409,
        code: 'INVALID_STATUS',
      });
    }

    await recallRepository.updateRecall(id, {
      status: 'cancelled',
      cancelled_by: userId,
      cancelled_at: new Date(),
      cancellation_reason: cancellationReason?.trim() || 'Recall cancelled by authorized supervisor',
    });

    return this.getRecallById(id, userId);
  }
}

export default new RecallService();
