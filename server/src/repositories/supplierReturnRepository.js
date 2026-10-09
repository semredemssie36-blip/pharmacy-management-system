import { getPool } from '../database/pool.js';

export const supplierReturnRepository = {
  async listSupplierReturns({
    organizationId,
    branchId,
    supplierId,
    goodsReceiptId,
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
      whereClauses.push('sr.organization_id = ?');
      params.push(organizationId);
    } else if (accessibleOrgIds?.length || accessibleBranchIds?.length) {
      const ors = [];
      if (accessibleOrgIds?.length) {
        ors.push(`sr.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
        params.push(...accessibleOrgIds);
      }
      if (accessibleBranchIds?.length) {
        ors.push(`sr.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
        params.push(...accessibleBranchIds);
      }
      whereClauses.push(`(${ors.join(' OR ')})`);
    } else {
      return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
    }

    if (branchId) {
      whereClauses.push('sr.branch_id = ?');
      params.push(branchId);
    }
    if (supplierId) {
      whereClauses.push('sr.supplier_id = ?');
      params.push(supplierId);
    }
    if (goodsReceiptId) {
      whereClauses.push('sr.goods_receipt_id = ?');
      params.push(goodsReceiptId);
    }
    if (status) {
      whereClauses.push('sr.status = ?');
      params.push(status);
    }
    if (startDate) {
      whereClauses.push('sr.return_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('sr.return_date <= ?');
      params.push(endDate);
    }
    if (search) {
      whereClauses.push('(sr.return_number LIKE ? OR gr.receipt_number LIKE ? OR s.name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const safeOffset = Math.max(0, (Number(page) - 1) * safeLimit);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM supplier_returns sr
       JOIN suppliers s ON s.id = sr.supplier_id
       JOIN goods_receipts gr ON gr.id = sr.goods_receipt_id
       ${whereSql}`,
      params,
    );
    const total = countRows[0]?.total || 0;

    const queryParams = [...params, safeLimit, safeOffset];
    const [rows] = await pool.query(
      `SELECT sr.id, sr.organization_id, sr.branch_id, sr.warehouse_id, sr.supplier_id,
              sr.goods_receipt_id, sr.return_number, sr.return_date, sr.status, sr.reason,
              sr.total_amount, sr.approved_by, sr.approved_at, sr.completed_by, sr.completed_at,
              sr.cancellation_reason, sr.created_by, sr.created_at, sr.updated_at,
              b.name AS branch_name,
              w.name AS warehouse_name,
              s.name AS supplier_name,
              gr.receipt_number,
              gr.receipt_date,
              u.name AS creator_name,
              (SELECT COUNT(*) FROM supplier_return_lines srl WHERE srl.supplier_return_id = sr.id) AS line_count
       FROM supplier_returns sr
       JOIN branches b ON b.id = sr.branch_id
       JOIN warehouses w ON w.id = sr.warehouse_id
       JOIN suppliers s ON s.id = sr.supplier_id
       JOIN goods_receipts gr ON gr.id = sr.goods_receipt_id
       JOIN users u ON u.id = sr.created_by
       ${whereSql}
       ORDER BY sr.id DESC
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
      `SELECT sr.*,
              b.name AS branch_name,
              w.name AS warehouse_name,
              s.name AS supplier_name,
              s.telephone AS supplier_telephone,
              s.email AS supplier_email,
              gr.receipt_number,
              gr.receipt_date,
              u.name AS creator_name,
              ua.name AS approver_name,
              uc.name AS completer_name
       FROM supplier_returns sr
       JOIN branches b ON b.id = sr.branch_id
       JOIN warehouses w ON w.id = sr.warehouse_id
       JOIN suppliers s ON s.id = sr.supplier_id
       JOIN goods_receipts gr ON gr.id = sr.goods_receipt_id
       JOIN users u ON u.id = sr.created_by
       LEFT JOIN users ua ON ua.id = sr.approved_by
       LEFT JOIN users uc ON uc.id = sr.completed_by
       WHERE sr.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async getReturnLines(supplierReturnId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT srl.*,
              p.name AS product_name,
              p.code AS product_code,
              b.batch_number,
              b.expiry_date,
              u.name AS unit_name,
              u.code AS unit_code,
              sl.name AS location_name,
              grl.received_quantity AS gr_received_quantity
       FROM supplier_return_lines srl
       JOIN products p ON p.id = srl.product_id
       JOIN batches b ON b.id = srl.batch_id
       JOIN units u ON u.id = srl.unit_id
       LEFT JOIN storage_locations sl ON sl.id = srl.storage_location_id
       JOIN goods_receipt_lines grl ON grl.id = srl.goods_receipt_line_id
       WHERE srl.supplier_return_id = ?
       ORDER BY srl.id ASC`,
      [supplierReturnId],
    );
    return rows;
  },

  async createReturn(data, connection) {
    const runner = connection || getPool();
    const [res] = await runner.query(
      `INSERT INTO supplier_returns (
         organization_id, branch_id, warehouse_id, supplier_id, goods_receipt_id,
         return_number, return_date, status, reason, total_amount, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.warehouseId,
        data.supplierId,
        data.goodsReceiptId,
        data.returnNumber,
        data.returnDate || new Date(),
        data.status || 'draft',
        data.reason,
        data.totalAmount || 0,
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
        `INSERT INTO supplier_return_lines (
           supplier_return_id, goods_receipt_line_id, product_id, batch_id, unit_id,
           storage_location_id, quantity, unit_price, line_total, reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.supplierReturnId,
          l.goodsReceiptLineId,
          l.productId,
          l.batchId,
          l.unitId,
          l.storageLocationId || null,
          l.quantity,
          l.unitPrice || 0,
          l.lineTotal || 0,
          l.reason || null,
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
    await runner.query(`UPDATE supplier_returns SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async getPreviouslyReturnedQuantityForReceiptLine(grLineId, excludeReturnId, connection) {
    const runner = connection || getPool();
    let query = `
      SELECT IFNULL(SUM(srl.quantity), 0) AS total_returned
      FROM supplier_return_lines srl
      JOIN supplier_returns sr ON sr.id = srl.supplier_return_id
      WHERE srl.goods_receipt_line_id = ?
        AND sr.status NOT IN ('cancelled')
    `;
    const params = [grLineId];
    if (excludeReturnId) {
      query += ' AND sr.id != ?';
      params.push(excludeReturnId);
    }
    const [rows] = await runner.query(query, params);
    return Number(rows[0]?.total_returned || 0);
  },
};

export default supplierReturnRepository;
