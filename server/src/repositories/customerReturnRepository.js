import { getPool } from '../database/pool.js';

export const customerReturnRepository = {
  async listCustomerReturns({
    organizationId,
    branchId,
    customerId,
    saleId,
    status,
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

    if (organizationId) {
      whereClauses.push('cr.organization_id = ?');
      params.push(organizationId);
    } else if (accessibleOrgIds?.length || accessibleBranchIds?.length) {
      const ors = [];
      if (accessibleOrgIds?.length) {
        ors.push(`cr.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
        params.push(...accessibleOrgIds);
      }
      if (accessibleBranchIds?.length) {
        ors.push(`cr.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
        params.push(...accessibleBranchIds);
      }
      whereClauses.push(`(${ors.join(' OR ')})`);
    } else {
      return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
    }

    if (branchId) {
      whereClauses.push('cr.branch_id = ?');
      params.push(branchId);
    }
    if (customerId) {
      whereClauses.push('cr.customer_id = ?');
      params.push(customerId);
    }
    if (saleId) {
      whereClauses.push('cr.sale_id = ?');
      params.push(saleId);
    }
    if (status) {
      whereClauses.push('cr.status = ?');
      params.push(status);
    }
    if (startDate) {
      whereClauses.push('cr.return_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('cr.return_date <= ?');
      params.push(endDate);
    }
    if (search) {
      whereClauses.push('(cr.return_number LIKE ? OR s.sale_number LIKE ? OR c.name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const safeOffset = Math.max(0, (Number(page) - 1) * safeLimit);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM customer_returns cr
       LEFT JOIN sales s ON s.id = cr.sale_id
       LEFT JOIN customers c ON c.id = cr.customer_id
       ${whereSql}`,
      params,
    );
    const total = countRows[0]?.total || 0;

    const queryParams = [...params, safeLimit, safeOffset];
    const [rows] = await pool.query(
      `SELECT cr.id, cr.organization_id, cr.branch_id, cr.warehouse_id, cr.sale_id,
              cr.customer_id, cr.return_number, cr.return_date, cr.status, cr.reason,
              cr.outcome, cr.refund_amount, cr.refund_id, cr.inspected_by, cr.inspected_at,
              cr.approved_by, cr.approved_at, cr.rejection_reason, cr.cancelled_reason,
              cr.created_by, cr.created_at, cr.updated_at,
              b.name AS branch_name,
              w.name AS warehouse_name,
              s.sale_number,
              s.total_amount AS sale_total_amount,
              c.name AS customer_name,
              u.name AS creator_name,
              (SELECT COUNT(*) FROM customer_return_lines crl WHERE crl.customer_return_id = cr.id) AS line_count
       FROM customer_returns cr
       JOIN branches b ON b.id = cr.branch_id
       JOIN warehouses w ON w.id = cr.warehouse_id
       JOIN sales s ON s.id = cr.sale_id
       LEFT JOIN customers c ON c.id = cr.customer_id
       JOIN users u ON u.id = cr.created_by
       ${whereSql}
       ORDER BY cr.id DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    );

    return {
      items: rows,
      total,
      page: Number(page),
      limit: safeLimit,
    };
  },

  async getReturnById(id, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT cr.*,
              b.name AS branch_name,
              w.name AS warehouse_name,
              s.sale_number,
              s.total_amount AS sale_total_amount,
              s.paid_amount AS sale_paid_amount,
              s.payment_status AS sale_payment_status,
              c.name AS customer_name,
              c.telephone AS customer_telephone,
              u.name AS creator_name,
              ui.name AS inspector_name,
              ua.name AS approver_name
       FROM customer_returns cr
       JOIN branches b ON b.id = cr.branch_id
       JOIN warehouses w ON w.id = cr.warehouse_id
       JOIN sales s ON s.id = cr.sale_id
       LEFT JOIN customers c ON c.id = cr.customer_id
       JOIN users u ON u.id = cr.created_by
       LEFT JOIN users ui ON ui.id = cr.inspected_by
       LEFT JOIN users ua ON ua.id = cr.approved_by
       WHERE cr.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async getReturnLines(customerReturnId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT crl.*,
              p.name AS product_name,
              p.code AS product_code,
              p.prescription_classification,
              b.batch_number,
              b.expiry_date,
              u.name AS unit_name,
              u.code AS unit_code,
              sl.name AS location_name
       FROM customer_return_lines crl
       JOIN products p ON p.id = crl.product_id
       JOIN batches b ON b.id = crl.batch_id
       JOIN units u ON u.id = crl.unit_id
       LEFT JOIN storage_locations sl ON sl.id = crl.storage_location_id
       WHERE crl.customer_return_id = ?
       ORDER BY crl.id ASC`,
      [customerReturnId],
    );
    return rows;
  },

  async createReturn(data, connection) {
    const runner = connection || getPool();
    const [res] = await runner.query(
      `INSERT INTO customer_returns (
         organization_id, branch_id, warehouse_id, sale_id, customer_id,
         return_number, return_date, status, reason, outcome, refund_amount,
         notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.warehouseId,
        data.saleId,
        data.customerId || null,
        data.returnNumber,
        data.returnDate || new Date(),
        data.status || 'draft',
        data.reason,
        data.outcome || 'pending',
        data.refundAmount || 0,
        data.notes || null,
        data.createdBy,
      ],
    );
    return res.insertId;
  },

  async createReturnLines(lines, connection) {
    const runner = connection || getPool();
    for (const l of lines) {
      await runner.query(
        `INSERT INTO customer_return_lines (
           customer_return_id, sale_line_id, product_id, batch_id, unit_id,
           storage_location_id, quantity, unit_price, line_total, condition_state,
           disposition, disposition_notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.customerReturnId,
          l.saleLineId,
          l.productId,
          l.batchId,
          l.unitId,
          l.storageLocationId || null,
          l.quantity,
          l.unitPrice,
          l.lineTotal,
          l.conditionState || 'sealed_intact',
          l.disposition || 'none',
          l.dispositionNotes || null,
        ],
      );
    }
  },

  async updateReturn(id, updates, connection) {
    const runner = connection || getPool();
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    await runner.query(`UPDATE customer_returns SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async updateReturnLine(id, updates, connection) {
    const runner = connection || getPool();
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return;
    params.push(id);
    await runner.query(`UPDATE customer_return_lines SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async getPreviouslyReturnedQuantityForSaleLine(saleLineId, excludeReturnId, connection) {
    const runner = connection || getPool();
    let query = `
      SELECT IFNULL(SUM(crl.quantity), 0) AS total_returned
      FROM customer_return_lines crl
      JOIN customer_returns cr ON cr.id = crl.customer_return_id
      WHERE crl.sale_line_id = ?
        AND cr.status NOT IN ('rejected', 'cancelled')
    `;
    const params = [saleLineId];
    if (excludeReturnId) {
      query += ' AND cr.id != ?';
      params.push(excludeReturnId);
    }
    const [rows] = await runner.query(query, params);
    return Number(rows[0]?.total_returned || 0);
  },
};

export default customerReturnRepository;
