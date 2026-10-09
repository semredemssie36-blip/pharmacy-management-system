import { getPool } from '../database/pool.js';

export class RecallRepository {
  async generateRecallNumber(organizationId, connection = null) {
    const db = connection || getPool();
    const year = new Date().getFullYear();
    const prefix = `REC-${year}-`;

    const [rows] = await db.query(
      `SELECT recall_number FROM recall_cases
       WHERE organization_id = ? AND recall_number LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [organizationId, `${prefix}%`],
    );

    let nextSeq = 1;
    if (rows.length > 0) {
      const match = rows[0].recall_number.match(/(\d+)$/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  async listRecalls({
    organizationIds = [],
    status,
    severity,
    productId,
    search,
    page = 1,
    limit = 20,
  }) {
    const db = getPool();
    const params = [];
    const whereClauses = [];

    if (organizationIds.length > 0) {
      whereClauses.push(`rc.organization_id IN (${organizationIds.map(() => '?').join(',')})`);
      params.push(...organizationIds);
    }
    if (status) {
      whereClauses.push('rc.status = ?');
      params.push(status);
    }
    if (severity) {
      whereClauses.push('rc.severity = ?');
      params.push(severity);
    }
    if (productId) {
      whereClauses.push('rc.product_id = ?');
      params.push(productId);
    }
    if (search) {
      whereClauses.push(
        '(rc.recall_number LIKE ? OR rc.title LIKE ? OR p.name LIKE ? OR p.code LIKE ? OR rc.initiating_party LIKE ?)',
      );
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM recall_cases rc
       JOIN products p ON p.id = rc.product_id
       ${whereSql}`,
      params,
    );

    const total = countRows[0].total;
    const offset = (Math.max(1, page) - 1) * limit;

    const [items] = await db.query(
      `SELECT rc.*,
              p.name AS product_name, p.code AS product_code,
              creator.name AS created_by_name,
              (SELECT COUNT(*) FROM recall_batches rb WHERE rb.recall_id = rc.id) AS batch_count,
              (SELECT COUNT(*) FROM recall_actions ra WHERE ra.recall_id = rc.id) AS action_count
       FROM recall_cases rc
       JOIN products p ON p.id = rc.product_id
       JOIN users creator ON creator.id = rc.created_by
       ${whereSql}
       ORDER BY rc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    return { items, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id) {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT rc.*,
              p.name AS product_name, p.code AS product_code,
              creator.name AS created_by_name,
              approver.name AS approved_by_name,
              activator.name AS activated_by_name,
              resolver.name AS resolved_by_name,
              canceller.name AS cancelled_by_name
       FROM recall_cases rc
       JOIN products p ON p.id = rc.product_id
       JOIN users creator ON creator.id = rc.created_by
       LEFT JOIN users approver ON approver.id = rc.approved_by
       LEFT JOIN users activator ON activator.id = rc.activated_by
       LEFT JOIN users resolver ON resolver.id = rc.resolved_by
       LEFT JOIN users canceller ON canceller.id = rc.cancelled_by
       WHERE rc.id = ?
       LIMIT 1`,
      [id],
    );

    return rows[0] || null;
  }

  async getRecallBatches(recallId) {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT rb.id, rb.recall_id, rb.batch_id,
              b.batch_number, b.expiry_date, b.status AS batch_status,
              b.organization_id
       FROM recall_batches rb
       JOIN batches b ON b.id = rb.batch_id
       WHERE rb.recall_id = ?
       ORDER BY b.expiry_date ASC, b.id ASC`,
      [recallId],
    );
    return rows;
  }

  async getRecallActions(recallId) {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT ra.*,
              u.name AS recorded_by_name,
              br.name AS branch_name,
              wh.name AS warehouse_name,
              b.batch_number
       FROM recall_actions ra
       JOIN users u ON u.id = ra.recorded_by
       LEFT JOIN branches br ON br.id = ra.branch_id
       LEFT JOIN warehouses wh ON wh.id = ra.warehouse_id
       LEFT JOIN batches b ON b.id = ra.batch_id
       WHERE ra.recall_id = ?
       ORDER BY ra.id DESC`,
      [recallId],
    );
    return rows;
  }

  async createRecall(data, connection = null) {
    const db = connection || getPool();
    const [res] = await db.query(
      `INSERT INTO recall_cases (
         organization_id, recall_number, title, description,
         reason_category, initiating_party, severity, scope_level,
         product_id, status, effective_date, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.recallNumber,
        data.title,
        data.description,
        data.reasonCategory,
        data.initiatingParty,
        data.severity || 'class_2',
        data.scopeLevel || 'batch',
        data.productId,
        data.status || 'draft',
        data.effectiveDate || new Date().toISOString().split('T')[0],
        data.createdBy,
      ],
    );
    return res.insertId;
  }

  async addRecallBatches(recallId, batchIds, connection = null) {
    if (!batchIds || batchIds.length === 0) return;
    const db = connection || getPool();
    const values = batchIds.map((batchId) => [recallId, batchId]);
    await db.query(
      'INSERT IGNORE INTO recall_batches (recall_id, batch_id) VALUES ?',
      [values],
    );
  }

  async updateRecall(id, fields, connection = null) {
    const db = connection || getPool();
    const sets = [];
    const params = [];

    Object.entries(fields).forEach(([k, v]) => {
      sets.push(`${k} = ?`);
      params.push(v);
    });

    if (sets.length === 0) return;

    params.push(id);
    await db.query(`UPDATE recall_cases SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async addAction(actionData, connection = null) {
    const db = connection || getPool();
    const [res] = await db.query(
      `INSERT INTO recall_actions (
         recall_id, action_type, branch_id, warehouse_id, batch_id,
         quantity, reference_type, reference_id, notes, recorded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actionData.recallId,
        actionData.actionType,
        actionData.branchId || null,
        actionData.warehouseId || null,
        actionData.batchId || null,
        actionData.quantity || 0,
        actionData.referenceType || null,
        actionData.referenceId || null,
        actionData.notes,
        actionData.recordedBy,
      ],
    );
    return res.insertId;
  }

  async getAffectedStockTraceability(recallId) {
    const db = getPool();
    // 1. Get batch IDs for this recall
    const [batchRows] = await db.query(
      'SELECT batch_id FROM recall_batches WHERE recall_id = ?',
      [recallId],
    );
    const batchIds = batchRows.map((r) => r.batch_id);

    if (batchIds.length === 0) {
      return {
        onHandTotal: 0,
        availableOnHand: 0,
        quarantinedOnHand: 0,
        recalledOnHand: 0,
        reservedOnHand: 0,
        disposedQuantity: 0,
        supplierReturnedQuantity: 0,
        soldOrDispensedQuantity: 0,
        locations: [],
      };
    }

    const placeholders = batchIds.map(() => '?').join(',');

    // 2. Query on-hand stock by status and location
    const [invRows] = await db.query(
      `SELECT inv.branch_id, br.name AS branch_name,
              inv.warehouse_id, wh.name AS warehouse_name,
              inv.storage_location_id, sl.name AS storage_location_name,
              inv.batch_id, b.batch_number, b.expiry_date,
              inv.unit_id, u.name AS unit_name,
              COALESCE(SUM(inv.quantity), 0) AS total_quantity,
              COALESCE(SUM(CASE WHEN inv.status = 'available' THEN inv.quantity ELSE 0 END), 0) AS available_quantity,
              COALESCE(SUM(CASE WHEN inv.status = 'quarantined' THEN inv.quantity ELSE 0 END), 0) AS quarantined_quantity,
              COALESCE(SUM(CASE WHEN inv.status = 'recalled' THEN inv.quantity ELSE 0 END), 0) AS recalled_quantity,
              COALESCE(SUM(CASE WHEN inv.status = 'reserved' THEN inv.quantity ELSE 0 END), 0) AS reserved_quantity
       FROM inventory inv
       JOIN branches br ON br.id = inv.branch_id
       JOIN warehouses wh ON wh.id = inv.warehouse_id
       JOIN storage_locations sl ON sl.id = inv.storage_location_id
       JOIN batches b ON b.id = inv.batch_id
       JOIN units u ON u.id = inv.unit_id
       WHERE inv.batch_id IN (${placeholders})
       GROUP BY inv.branch_id, inv.warehouse_id, inv.storage_location_id, inv.batch_id, inv.unit_id`,
      batchIds,
    );

    let onHandTotal = 0;
    let availableOnHand = 0;
    let quarantinedOnHand = 0;
    let recalledOnHand = 0;
    let reservedOnHand = 0;

    invRows.forEach((r) => {
      onHandTotal += Number(r.total_quantity);
      availableOnHand += Number(r.available_quantity);
      quarantinedOnHand += Number(r.quarantined_quantity);
      recalledOnHand += Number(r.recalled_quantity);
      reservedOnHand += Number(r.reserved_quantity);
    });

    // 3. Query historical sold / dispensed quantities for these batches
    const [saleRows] = await db.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_sold
       FROM sale_batch_allocations
       WHERE batch_id IN (${placeholders})`,
      batchIds,
    );
    const totalSold = Number(saleRows[0]?.total_sold || 0);

    const [dispRows] = await db.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_dispensed
       FROM dispensing_batch_allocations
       WHERE batch_id IN (${placeholders}) AND status = 'dispensed'`,
      batchIds,
    );
    const totalDispensed = Number(dispRows[0]?.total_dispensed || 0);

    // 4. Query action totals for this recall
    const [actionRows] = await db.query(
      `SELECT action_type, COALESCE(SUM(quantity), 0) AS total_qty
       FROM recall_actions
       WHERE recall_id = ?
       GROUP BY action_type`,
      [recallId],
    );

    let disposedQuantity = 0;
    let supplierReturnedQuantity = 0;

    actionRows.forEach((a) => {
      if (a.action_type === 'disposal') disposedQuantity += Number(a.total_qty);
      if (a.action_type === 'supplier_return') supplierReturnedQuantity += Number(a.total_qty);
    });

    return {
      onHandTotal,
      availableOnHand,
      quarantinedOnHand,
      recalledOnHand,
      reservedOnHand,
      disposedQuantity,
      supplierReturnedQuantity,
      soldOrDispensedQuantity: totalSold + totalDispensed,
      locations: invRows,
    };
  }
}

export default new RecallRepository();
