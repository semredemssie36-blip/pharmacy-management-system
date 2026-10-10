import { getPool } from '../database/pool.js';

export const paymentRepository = {
  async listPayments({
    organizationId,
    branchId,
    customerId,
    status,
    paymentMethod,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 20,
    accessibleOrgIds,
    accessibleBranchIds,
  }) {
    const pool = getPool();
    const whereClauses = [];
    const params = [];

    if (organizationId && organizationId !== 'undefined') {
      whereClauses.push('p.organization_id = ?');
      params.push(organizationId);
    } else if (accessibleOrgIds?.length || accessibleBranchIds?.length) {
      const ors = [];
      if (accessibleOrgIds?.length) {
        ors.push(`p.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
        params.push(...accessibleOrgIds);
      }
      if (accessibleBranchIds?.length) {
        ors.push(`p.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
        params.push(...accessibleBranchIds);
      }
      whereClauses.push(`(${ors.join(' OR ')})`);
    } else {
      const [oRows] = await pool.query('SELECT id FROM organizations WHERE status = "active" LIMIT 1');
      if (oRows.length > 0) {
        whereClauses.push('p.organization_id = ?');
        params.push(oRows[0].id);
      }
    }

    if (branchId && branchId !== 'undefined') {
      whereClauses.push('p.branch_id = ?');
      params.push(branchId);
    }
    if (customerId && customerId !== 'undefined') {
      whereClauses.push('p.customer_id = ?');
      params.push(customerId);
    }
    if (status && status !== 'undefined') {
      whereClauses.push('p.status = ?');
      params.push(status);
    }
    if (paymentMethod && paymentMethod !== 'undefined') {
      whereClauses.push('p.payment_method = ?');
      params.push(paymentMethod);
    }
    if (startDate && startDate !== 'undefined') {
      whereClauses.push('p.payment_date >= ?');
      params.push(startDate);
    }
    if (endDate && endDate !== 'undefined') {
      whereClauses.push('p.payment_date <= ?');
      params.push(endDate);
    }
    if (search && search.trim() && search.trim() !== 'undefined') {
      const term = `%${search.trim()}%`;
      whereClauses.push('(p.payment_number LIKE ? OR p.external_reference LIKE ? OR c.name LIKE ?)');
      params.push(term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM payments p
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [items] = await pool.query(
      `SELECT p.id, p.organization_id, p.branch_id, p.payment_number, p.payment_date,
              p.payment_method, p.amount, p.currency, p.status, p.customer_id,
              p.external_reference, p.notes, p.recorded_by, p.verified_by, p.verified_at,
              p.cancelled_by, p.cancelled_at, p.cancellation_reason, p.created_at, p.updated_at,
              b.name AS branch_name,
              c.name AS customer_name,
              u.name AS recorded_by_name,
              vu.name AS verified_by_name,
              (SELECT IFNULL(SUM(pa.amount), 0) FROM payment_allocations pa WHERE pa.payment_id = p.id) AS allocated_amount,
              (SELECT IFNULL(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status = 'completed') AS refunded_amount
       FROM payments p
       JOIN branches b ON b.id = p.branch_id
       JOIN users u ON u.id = p.recorded_by
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users vu ON vu.id = p.verified_by
       WHERE ${whereSql}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    );

    return { items, total };
  },

  async findById(id, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT p.id, p.organization_id, p.branch_id, p.payment_number, p.payment_date,
              p.payment_method, p.amount, p.currency, p.status, p.customer_id,
              p.external_reference, p.notes, p.recorded_by, p.verified_by, p.verified_at,
              p.cancelled_by, p.cancelled_at, p.cancellation_reason, p.created_at, p.updated_at,
              b.name AS branch_name,
              c.name AS customer_name,
              u.name AS recorded_by_name,
              vu.name AS verified_by_name,
              cu.name AS cancelled_by_name
       FROM payments p
       JOIN branches b ON b.id = p.branch_id
       JOIN users u ON u.id = p.recorded_by
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users vu ON vu.id = p.verified_by
       LEFT JOIN users cu ON cu.id = p.cancelled_by
       WHERE p.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async findByIdForUpdate(id, connection) {
    if (!connection) throw new Error('findByIdForUpdate requires an active connection');
    const [rows] = await connection.query(
      `SELECT p.id, p.organization_id, p.branch_id, p.payment_number, p.payment_date,
              p.payment_method, p.amount, p.currency, p.status, p.customer_id,
              p.external_reference, p.notes, p.recorded_by, p.verified_by, p.verified_at,
              p.cancelled_by, p.cancelled_at, p.cancellation_reason, p.created_at, p.updated_at
       FROM payments p
       WHERE p.id = ?
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    return rows[0] || null;
  },

  async createPayment(data, connection) {
    const runner = connection || getPool();
    const [result] = await runner.query(
      `INSERT INTO payments (
         organization_id, branch_id, payment_number, payment_date,
         payment_method, amount, currency, status, customer_id,
         external_reference, notes, recorded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.paymentNumber,
        data.paymentDate || new Date(),
        data.paymentMethod,
        data.amount,
        data.currency || 'ETB',
        data.status || 'completed',
        data.customerId || null,
        data.externalReference || null,
        data.notes || null,
        data.recordedBy,
      ],
    );
    return result.insertId;
  },

  async updatePayment(id, data, connection) {
    const runner = connection || getPool();
    const fields = [];
    const values = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.verifiedBy !== undefined) {
      fields.push('verified_by = ?');
      values.push(data.verifiedBy);
    }
    if (data.verifiedAt !== undefined) {
      fields.push('verified_at = ?');
      values.push(data.verifiedAt);
    }
    if (data.cancelledBy !== undefined) {
      fields.push('cancelled_by = ?');
      values.push(data.cancelledBy);
    }
    if (data.cancelledAt !== undefined) {
      fields.push('cancelled_at = ?');
      values.push(data.cancelledAt);
    }
    if (data.cancellationReason !== undefined) {
      fields.push('cancellation_reason = ?');
      values.push(data.cancellationReason);
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?');
      values.push(data.notes);
    }

    if (fields.length === 0) return 0;

    values.push(id);
    const [result] = await runner.query(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    return result.affectedRows;
  },

  async createAllocation(data, connection) {
    const runner = connection || getPool();
    const [result] = await runner.query(
      `INSERT INTO payment_allocations (
         organization_id, payment_id, reference_type, reference_id, amount
       ) VALUES (?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.paymentId,
        data.referenceType,
        data.referenceId,
        data.amount,
      ],
    );
    return result.insertId;
  },

  async getAllocationsByPaymentId(paymentId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT pa.id, pa.organization_id, pa.payment_id, pa.reference_type, pa.reference_id, pa.amount, pa.created_at,
              CASE
                WHEN pa.reference_type = 'sale' THEN s.sale_number
                WHEN pa.reference_type = 'dispensing' THEN d.dispensing_number
                WHEN pa.reference_type = 'receivable' THEN cr.receivable_number
                ELSE NULL
              END AS reference_number
       FROM payment_allocations pa
       LEFT JOIN sales s ON pa.reference_type = 'sale' AND s.id = pa.reference_id
       LEFT JOIN dispensings d ON pa.reference_type = 'dispensing' AND d.id = pa.reference_id
       LEFT JOIN customer_receivables cr ON pa.reference_type = 'receivable' AND cr.id = pa.reference_id
       WHERE pa.payment_id = ?
       ORDER BY pa.id ASC`,
      [paymentId],
    );
    return rows;
  },

  async getAllocationsByReference(referenceType, referenceId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT pa.id, pa.payment_id, pa.amount, pa.created_at,
              p.payment_number, p.payment_date, p.payment_method, p.status AS payment_status,
              p.external_reference, u.name AS recorded_by_name
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       JOIN users u ON u.id = p.recorded_by
       WHERE pa.reference_type = ? AND pa.reference_id = ?
       ORDER BY pa.id ASC`,
      [referenceType, referenceId],
    );
    return rows;
  },

  async createRefund(data, connection) {
    const runner = connection || getPool();
    const [result] = await runner.query(
      `INSERT INTO refunds (
         organization_id, branch_id, refund_number, payment_id, reference_type,
         reference_id, amount, reason, refund_method, external_reference,
         status, approved_by, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.refundNumber,
        data.paymentId,
        data.referenceType,
        data.referenceId,
        data.amount,
        data.reason,
        data.refundMethod,
        data.externalReference || null,
        data.status || 'completed',
        data.approvedBy || null,
        data.createdBy,
      ],
    );
    return result.insertId;
  },

  async getRefundsByPaymentId(paymentId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT r.id, r.organization_id, r.branch_id, r.refund_number, r.payment_id,
              r.reference_type, r.reference_id, r.amount, r.reason, r.refund_method,
              r.external_reference, r.status, r.approved_by, r.created_by, r.created_at,
              u.name AS created_by_name,
              au.name AS approved_by_name
       FROM refunds r
       JOIN users u ON u.id = r.created_by
       LEFT JOIN users au ON au.id = r.approved_by
       WHERE r.payment_id = ?
       ORDER BY r.id ASC`,
      [paymentId],
    );
    return rows;
  },

  async getRefundsByReference(referenceType, referenceId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT r.id, r.organization_id, r.branch_id, r.refund_number, r.payment_id,
              r.reference_type, r.reference_id, r.amount, r.reason, r.refund_method,
              r.external_reference, r.status, r.created_at,
              u.name AS created_by_name
       FROM refunds r
       JOIN users u ON u.id = r.created_by
       WHERE r.reference_type = ? AND r.reference_id = ?
       ORDER BY r.id ASC`,
      [referenceType, referenceId],
    );
    return rows;
  },

  async listRefunds({ organizationId, branchId, page = 1, limit = 20 }) {
    const pool = getPool();
    const whereClauses = ['r.organization_id = ?'];
    const params = [organizationId];

    if (branchId) {
      whereClauses.push('r.branch_id = ?');
      params.push(branchId);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM refunds r WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [items] = await pool.query(
      `SELECT r.id, r.organization_id, r.branch_id, r.refund_number, r.payment_id,
              r.reference_type, r.reference_id, r.amount, r.reason, r.refund_method,
              r.external_reference, r.status, r.created_at,
              b.name AS branch_name,
              p.payment_number,
              u.name AS created_by_name
       FROM refunds r
       JOIN branches b ON b.id = r.branch_id
       JOIN payments p ON p.id = r.payment_id
       JOIN users u ON u.id = r.created_by
       WHERE ${whereSql}
       ORDER BY r.id DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    );

    return { items, total };
  },
};

export default paymentRepository;
