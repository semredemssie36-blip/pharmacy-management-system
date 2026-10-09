import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import dispensingRepository from '../repositories/dispensingRepository.js';
import inventoryService from './inventoryService.js';
import { getPool } from '../database/pool.js';

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function canAccess(sets, row) {
  return (
    sets.orgIds.includes(Number(row.organization_id)) ||
    sets.branchIds.includes(Number(row.branch_id)) ||
    sets.warehouseIds.includes(Number(row.warehouse_id))
  );
}

async function generateDispensingNumber(organizationId, connection) {
  const runner = connection || getPool();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `DSP-${organizationId}-${dateStr}-${rand}`;
    const [existing] = await runner.query(
      'SELECT id FROM dispensings WHERE organization_id = ? AND dispensing_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (existing.length === 0) return candidate;
  }
  return `DSP-${organizationId}-${dateStr}-${Date.now().toString().slice(-6)}`;
}

export const dispensingService = {
  async listDispensings(filters, userId) {
    const sets = await getScopeSets(userId);
    let organizationId = filters.organizationId ? Number(filters.organizationId) : null;

    if (!organizationId) {
      organizationId = sets.orgIds[0] || null;
    }

    if (!organizationId || !sets.orgIds.includes(organizationId)) {
      return { items: [], total: 0 };
    }

    return dispensingRepository.listDispensings({
      ...filters,
      organizationId,
    });
  },

  async getDispensingById(id, userId) {
    const dispensing = await dispensingRepository.findById(id);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const lines = await dispensingRepository.getLines(id);
    for (const line of lines) {
      line.allocations = await dispensingRepository.getAllocations(line.id);
    }

    dispensing.lines = lines;
    return dispensing;
  },

  async createDispensing(input, userId) {
    const pool = getPool();
    const sets = await getScopeSets(userId);

    const prescriptionId = Number(input.prescriptionId);
    if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
      throw new ValidationError('Validation failed', [{ field: 'prescriptionId', message: 'Valid prescriptionId is required' }]);
    }

    const [rxRows] = await pool.query(
      `SELECT rx.id, rx.organization_id, rx.branch_id, rx.patient_id, rx.prescription_number,
              rx.prescription_date, rx.expiry_date, rx.status
       FROM prescriptions rx
       WHERE rx.id = ? LIMIT 1`,
      [prescriptionId],
    );
    const rx = rxRows[0];
    if (!rx) {
      throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });
    }

    const organizationId = Number(rx.organization_id);
    if (!sets.orgIds.includes(organizationId)) {
      throw new AppError('You do not have access to this organization', { statusCode: 403, code: 'FORBIDDEN' });
    }

    // Prescription status verification
    const eligibleStatuses = ['validated', 'partially_dispensed', 'refill_available'];
    if (!eligibleStatuses.includes(rx.status)) {
      if (rx.status === 'draft' || rx.status === 'pending') {
        throw new AppError('Prescription has not been clinically validated', { statusCode: 409, code: 'PRESCRIPTION_NOT_VALIDATED' });
      }
      if (rx.status === 'cancelled') {
        throw new AppError('Prescription has been cancelled', { statusCode: 409, code: 'PRESCRIPTION_CANCELLED' });
      }
      if (rx.status === 'expired') {
        throw new AppError('Prescription has expired', { statusCode: 409, code: 'PRESCRIPTION_EXPIRED' });
      }
      if (rx.status === 'fully_dispensed') {
        throw new AppError('Prescription is already fully dispensed', { statusCode: 409, code: 'PRESCRIPTION_FULLY_DISPENSED' });
      }
      throw new AppError(`Prescription with status "${rx.status}" cannot be dispensed`, { statusCode: 409, code: 'PRESCRIPTION_NOT_ELIGIBLE' });
    }

    // Prescription Expiry Verification
    const expDate = new Date(rx.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expDate < today) {
      throw new AppError('Prescription has expired', { statusCode: 409, code: 'PRESCRIPTION_EXPIRED' });
    }

    // Patient Verification
    const [patRows] = await pool.query(
      'SELECT id, organization_id, status FROM patients WHERE id = ? LIMIT 1',
      [rx.patient_id],
    );
    const patient = patRows[0];
    if (!patient || patient.status !== 'active') {
      throw new AppError('Patient is inactive or cannot be found', { statusCode: 409, code: 'PATIENT_INACTIVE' });
    }

    // Branch & Warehouse Verification
    let branchId = input.branchId ? Number(input.branchId) : rx.branch_id || sets.branchIds[0];
    if (!branchId) {
      const [bRows] = await pool.query("SELECT id FROM branches WHERE organization_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1", [organizationId]);
      branchId = bRows[0]?.id;
    }
    if (!branchId) {
      throw new AppError('No active branch found for dispensing', { statusCode: 409, code: 'BRANCH_NOT_FOUND' });
    }

    let warehouseId = input.warehouseId ? Number(input.warehouseId) : null;
    if (!warehouseId) {
      const [wRows] = await pool.query("SELECT id FROM warehouses WHERE branch_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1", [branchId]);
      warehouseId = wRows[0]?.id;
    }
    if (!warehouseId) {
      throw new AppError('No active warehouse found for selected branch', { statusCode: 409, code: 'WAREHOUSE_NOT_FOUND' });
    }

    const hasWhScope = sets.orgIds.includes(organizationId) || sets.branchIds.includes(branchId) || sets.warehouseIds.includes(warehouseId);
    if (!hasWhScope) {
      throw new AppError('You do not have access to this warehouse scope', { statusCode: 403, code: 'FORBIDDEN' });
    }

    // Validate Lines
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new ValidationError('Validation failed', [{ field: 'lines', message: 'At least one medicine line must be selected for dispensing' }]);
    }

    const [rxLines] = await pool.query(
      `SELECT pl.id, pl.prescription_id, pl.product_id, pl.unit_id,
              pl.quantity_prescribed, pl.quantity_dispensed, pl.quantity_remaining,
              p.name AS product_name, p.status AS product_status
       FROM prescription_lines pl
       JOIN products p ON p.id = pl.product_id
       WHERE pl.prescription_id = ?`,
      [prescriptionId],
    );

    const rxLineMap = new Map(rxLines.map((l) => [l.id, l]));
    const processedLines = [];

    for (let idx = 0; idx < input.lines.length; idx += 1) {
      const l = input.lines[idx];
      const prefix = `lines[${idx}]`;

      const pLineId = Number(l.prescriptionLineId);
      const rxLine = rxLineMap.get(pLineId);
      if (!rxLine) {
        throw new ValidationError('Validation failed', [{ field: `${prefix}.prescriptionLineId`, message: 'Prescription line does not belong to this prescription' }]);
      }

      if (rxLine.product_status !== 'active') {
        throw new AppError(`Prescribed product ${rxLine.product_name} is inactive`, { statusCode: 409, code: 'PRODUCT_INACTIVE' });
      }

      const qtyRequested = Number(l.quantityRequested);
      if (!Number.isFinite(qtyRequested) || qtyRequested <= 0) {
        throw new ValidationError('Validation failed', [{ field: `${prefix}.quantityRequested`, message: 'Quantity requested must be a positive number' }]);
      }

      const remaining = Number(rxLine.quantity_remaining);
      if (qtyRequested > remaining) {
        throw new AppError(
          `Requested quantity (${qtyRequested}) exceeds remaining prescription quantity (${remaining}) for ${rxLine.product_name}`,
          { statusCode: 409, code: 'QUANTITY_EXCEEDS_REMAINING' },
        );
      }

      // Unit resolution
      let resolvedUnitId = l.unitId ? Number(l.unitId) : (rxLine.unit_id ? Number(rxLine.unit_id) : null);
      if (!resolvedUnitId) {
        const [puRows] = await pool.query(
          'SELECT unit_id FROM product_units WHERE product_id = ? ORDER BY is_base_unit DESC LIMIT 1',
          [rxLine.product_id],
        );
        if (puRows.length > 0 && puRows[0].unit_id) {
          resolvedUnitId = Number(puRows[0].unit_id);
        } else {
          const [uRows] = await pool.query('SELECT id FROM units WHERE organization_id = ? LIMIT 1', [organizationId]);
          if (uRows.length > 0) {
            resolvedUnitId = Number(uRows[0].id);
          } else {
            throw new AppError(`No unit configured for product ${rxLine.product_name}`, { statusCode: 409, code: 'UNIT_NOT_FOUND' });
          }
        }
      }

      processedLines.push({
        prescriptionLineId: rxLine.id,
        productId: rxLine.product_id,
        unitId: resolvedUnitId,
        quantityRequested: qtyRequested,
        notes: typeof l.notes === 'string' ? l.notes.trim() : null,
      });
    }

    const dispensingNumber = await generateDispensingNumber(organizationId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const dispensingId = await dispensingRepository.createDispensing(
        {
          organizationId,
          branchId,
          warehouseId,
          prescriptionId,
          patientId: rx.patient_id,
          dispensingNumber,
          dispensingDate: input.dispensingDate ? new Date(input.dispensingDate) : new Date(),
          status: 'draft',
          notes: typeof input.notes === 'string' ? input.notes.trim() : null,
          createdBy: userId,
        },
        processedLines,
        connection,
      );

      await connection.commit();
      return this.getDispensingById(dispensingId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async allocateStock(dispensingId, userId) {
    const dispensing = await dispensingRepository.findById(dispensingId);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (dispensing.status !== 'draft' && dispensing.status !== 'stock_allocated') {
      throw new AppError(`Cannot allocate stock for dispensing with status "${dispensing.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
    }

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // If already allocated, release previous reservations cleanly first
      if (dispensing.status === 'stock_allocated') {
        await inventoryService.releaseDispensingReservations({ dispensingId, connection });
      }

      const lines = await dispensingRepository.getLines(dispensingId, connection);
      if (lines.length === 0) {
        throw new ValidationError('Validation failed', [{ field: 'lines', message: 'Dispensing has no lines' }]);
      }

      // Reserve stock via FEFO
      await inventoryService.reserveDispensingFefoStock({
        organizationId: dispensing.organization_id,
        branchId: dispensing.branch_id,
        warehouseId: dispensing.warehouse_id,
        dispensingId,
        lines,
        userId,
        connection,
      });

      await dispensingRepository.updateStatus(dispensingId, 'stock_allocated', {}, connection);

      await connection.commit();
      return this.getDispensingById(dispensingId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async submitForVerification(dispensingId, userId) {
    const dispensing = await dispensingRepository.findById(dispensingId);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (dispensing.status !== 'stock_allocated') {
      throw new AppError('Stock must be allocated before submitting for pharmacist verification', { statusCode: 409, code: 'STOCK_NOT_ALLOCATED' });
    }

    const lines = await dispensingRepository.getLines(dispensingId);
    for (const l of lines) {
      if (Number(l.quantity_allocated) < Number(l.quantity_requested)) {
        throw new AppError(`Line for product ${l.product_name} is not fully allocated`, { statusCode: 409, code: 'INCOMPLETE_ALLOCATION' });
      }
    }

    await dispensingRepository.updateStatus(dispensingId, 'pending_verification');
    return this.getDispensingById(dispensingId, userId);
  },

  async verifyDispensing(dispensingId, input, userId) {
    const dispensing = await dispensingRepository.findById(dispensingId);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (dispensing.status !== 'pending_verification' && dispensing.status !== 'stock_allocated') {
      throw new AppError(`Cannot verify dispensing with status "${dispensing.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Lock prescription and re-verify validity
      const [rxRows] = await connection.query(
        'SELECT id, expiry_date, status FROM prescriptions WHERE id = ? FOR UPDATE',
        [dispensing.prescription_id],
      );
      const rx = rxRows[0];
      if (!rx || rx.status === 'cancelled') {
        throw new AppError('Prescription has been cancelled', { statusCode: 409, code: 'PRESCRIPTION_CANCELLED' });
      }

      const expDate = new Date(rx.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expDate < today) {
        throw new AppError('Prescription has expired', { statusCode: 409, code: 'PRESCRIPTION_EXPIRED' });
      }

      // Check Patient Status
      const [patRows] = await connection.query(
        'SELECT status FROM patients WHERE id = ? LIMIT 1',
        [dispensing.patient_id],
      );
      if (patRows[0]?.status !== 'active') {
        throw new AppError('Patient is inactive', { statusCode: 409, code: 'PATIENT_INACTIVE' });
      }

      // Verify allocated batches are still not expired
      const allocations = await dispensingRepository.getAllocationsByDispensing(dispensingId, connection);
      if (allocations.length === 0) {
        throw new AppError('No stock allocated for this dispensing', { statusCode: 409, code: 'NO_STOCK_ALLOCATED' });
      }

      for (const a of allocations) {
        if (new Date(a.expiry_date) < today) {
          throw new AppError(`Allocated batch ${a.batch_number} has expired`, { statusCode: 409, code: 'BATCH_EXPIRED' });
        }
      }

      // Record pharmacist verification
      const verifiedAt = new Date();
      const verificationNotes = typeof input?.verificationNotes === 'string' ? input.verificationNotes.trim() : null;

      // Update prescription line dispensed & remaining quantities
      const lines = await dispensingRepository.getLines(dispensingId, connection);
      for (const line of lines) {
        const qtyToDispense = Number(line.quantity_requested);

        await connection.query(
          `UPDATE prescription_lines
           SET quantity_dispensed = quantity_dispensed + ?,
               quantity_remaining = GREATEST(0, quantity_prescribed - quantity_dispensed)
           WHERE id = ?`,
          [qtyToDispense, line.prescription_line_id],
        );

        // If line has refills and is fully dispensed, process refill event
        const [refillCheck] = await connection.query(
          'SELECT quantity_remaining, refills_allowed, refills_remaining FROM prescription_lines WHERE id = ?',
          [line.prescription_line_id],
        );
        const updatedPl = refillCheck[0];
        if (updatedPl && Number(updatedPl.quantity_remaining) <= 0.000001 && Number(updatedPl.refills_remaining) > 0) {
          await connection.query(
            `UPDATE prescription_lines
             SET refills_dispensed = refills_dispensed + 1,
                 refills_remaining = GREATEST(0, refills_remaining - 1)
             WHERE id = ?`,
            [line.prescription_line_id],
          );

          await connection.query(
            `UPDATE prescription_refills
             SET status = 'dispensed',
                 dispense_reference_id = ?,
                 dispensed_at = NOW()
             WHERE prescription_line_id = ? AND status = 'available'
             ORDER BY refill_number ASC
             LIMIT 1`,
            [dispensingId, line.prescription_line_id],
          );
        }
      }

      // Recalculate and update Prescription Header Status
      const [allPlRows] = await connection.query(
        'SELECT quantity_remaining, refills_remaining FROM prescription_lines WHERE prescription_id = ?',
        [dispensing.prescription_id],
      );

      let totalRemaining = 0;
      let totalRefillsRemaining = 0;
      for (const r of allPlRows) {
        totalRemaining += Number(r.quantity_remaining);
        totalRefillsRemaining += Number(r.refills_remaining);
      }

      let newRxStatus = 'partially_dispensed';
      if (totalRemaining <= 0.000001) {
        if (totalRefillsRemaining > 0) {
          newRxStatus = 'refill_available';
        } else {
          newRxStatus = 'fully_dispensed';
        }
      }

      await connection.query(
        'UPDATE prescriptions SET status = ? WHERE id = ?',
        [newRxStatus, dispensing.prescription_id],
      );

      // Transition Dispensing to Verified -> Payment Pending
      await dispensingRepository.updateStatus(
        dispensingId,
        'payment_pending',
        {
          verifiedBy: userId,
          verifiedAt,
          verificationNotes,
        },
        connection,
      );

      await connection.commit();
      return this.getDispensingById(dispensingId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async rejectDispensing(dispensingId, input, userId) {
    const reason = typeof input?.rejectionReason === 'string'
      ? input.rejectionReason.trim()
      : (typeof input?.reason === 'string' ? input.reason.trim() : '');
    if (!reason) {
      throw new ValidationError('Validation failed', [{ field: 'rejectionReason', message: 'Rejection reason is required' }]);
    }

    const dispensing = await dispensingRepository.findById(dispensingId);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (dispensing.status !== 'pending_verification' && dispensing.status !== 'stock_allocated') {
      throw new AppError(`Cannot reject dispensing with status "${dispensing.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Release any stock reservations
      await inventoryService.releaseDispensingReservations({ dispensingId, connection });

      await dispensingRepository.updateStatus(
        dispensingId,
        'rejected',
        {
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
        connection,
      );

      await connection.commit();
      return this.getDispensingById(dispensingId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async cancelDispensing(dispensingId, input, userId) {
    const reason = typeof input?.cancellationReason === 'string'
      ? input.cancellationReason.trim()
      : (typeof input?.reason === 'string' ? input.reason.trim() : '');
    if (!reason) {
      throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Cancellation reason is required' }]);
    }

    const dispensing = await dispensingRepository.findById(dispensingId);
    if (!dispensing) {
      throw new AppError('Dispensing transaction not found', { statusCode: 404, code: 'DISPENSING_NOT_FOUND' });
    }

    const sets = await getScopeSets(userId);
    if (!canAccess(sets, dispensing)) {
      throw new AppError('You do not have access to this dispensing transaction', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const allowedCancelStatuses = ['draft', 'stock_allocated', 'pending_verification', 'verified', 'payment_pending'];
    if (!allowedCancelStatuses.includes(dispensing.status)) {
      throw new AppError(`Cannot cancel dispensing with status "${dispensing.status}"`, { statusCode: 409, code: 'INVALID_STATUS' });
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Release reserved stock if any
      await inventoryService.releaseDispensingReservations({ dispensingId, connection });

      // If dispensing was verified / payment_pending, reverse prescription line quantities
      if (dispensing.status === 'verified' || dispensing.status === 'payment_pending') {
        const lines = await dispensingRepository.getLines(dispensingId, connection);
        for (const line of lines) {
          const qty = Number(line.quantity_requested);
          await connection.query(
            `UPDATE prescription_lines
             SET quantity_dispensed = GREATEST(0, quantity_dispensed - ?),
                 quantity_remaining = quantity_prescribed - quantity_dispensed
             WHERE id = ?`,
            [qty, line.prescription_line_id],
          );
        }

        // Recalculate prescription status
        const [allPlRows] = await connection.query(
          'SELECT quantity_prescribed, quantity_dispensed, quantity_remaining FROM prescription_lines WHERE prescription_id = ?',
          [dispensing.prescription_id],
        );

        let totalPrescribed = 0;
        let totalDispensed = 0;
        for (const r of allPlRows) {
          totalPrescribed += Number(r.quantity_prescribed);
          totalDispensed += Number(r.quantity_dispensed);
        }

        let restoredRxStatus = 'validated';
        if (totalDispensed > 0 && totalDispensed < totalPrescribed) {
          restoredRxStatus = 'partially_dispensed';
        }

        await connection.query(
          'UPDATE prescriptions SET status = ? WHERE id = ?',
          [restoredRxStatus, dispensing.prescription_id],
        );
      }

      await dispensingRepository.updateStatus(
        dispensingId,
        'cancelled',
        {
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancelledReason: reason,
        },
        connection,
      );

      await connection.commit();
      return this.getDispensingById(dispensingId, userId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },
};

export default dispensingService;
