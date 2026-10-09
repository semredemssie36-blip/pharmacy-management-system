import { getPool } from '../database/pool.js';

export class QuarantineRepository {
  async generateQuarantineNumber(organizationId, connection = null) {
    const db = connection || getPool();
    const year = new Date().getFullYear();
    const prefix = `QRN-${year}-`;

    const [rows] = await db.query(
      `SELECT quarantine_number FROM quarantine_cases
       WHERE organization_id = ? AND quarantine_number LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [organizationId, `${prefix}%`],
    );

    let nextSeq = 1;
    if (rows.length > 0) {
      const match = rows[0].quarantine_number.match(/(\d+)$/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  async listQuarantines({
    organizationIds = [],
    branchIds = [],
    warehouseIds = [],
    status,
    productId,
    batchId,
    search,
    page = 1,
    limit = 20,
  }) {
    const db = getPool();
    const params = [];
    const whereClauses = [];

    if (organizationIds.length > 0) {
      whereClauses.push(`qc.organization_id IN (${organizationIds.map(() => '?').join(',')})`);
      params.push(...organizationIds);
    }
    if (branchIds.length > 0) {
      whereClauses.push(`qc.branch_id IN (${branchIds.map(() => '?').join(',')})`);
      params.push(...branchIds);
    }
    if (warehouseIds.length > 0) {
      whereClauses.push(`qc.warehouse_id IN (${warehouseIds.map(() => '?').join(',')})`);
      params.push(...warehouseIds);
    }
    if (status) {
      whereClauses.push('qc.status = ?');
      params.push(status);
    }
    if (productId) {
      whereClauses.push('qc.product_id = ?');
      params.push(productId);
    }
    if (batchId) {
      whereClauses.push('qc.batch_id = ?');
      params.push(batchId);
    }
    if (search) {
      whereClauses.push(
        '(qc.quarantine_number LIKE ? OR p.name LIKE ? OR p.code LIKE ? OR b.batch_number LIKE ? OR qc.reason LIKE ?)',
      );
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM quarantine_cases qc
       JOIN products p ON p.id = qc.product_id
       JOIN batches b ON b.id = qc.batch_id
       ${whereSql}`,
      params,
    );

    const total = countRows[0].total;
    const offset = (Math.max(1, page) - 1) * limit;

    const [items] = await db.query(
      `SELECT qc.*,
              p.name AS product_name, p.code AS product_code,
              b.batch_number, b.expiry_date,
              u.name AS unit_name,
              br.name AS branch_name,
              wh.name AS warehouse_name,
              sl.name AS storage_location_name,
              creator.name AS created_by_name
       FROM quarantine_cases qc
       JOIN products p ON p.id = qc.product_id
       JOIN batches b ON b.id = qc.batch_id
       JOIN units u ON u.id = qc.unit_id
       JOIN branches br ON br.id = qc.branch_id
       JOIN warehouses wh ON wh.id = qc.warehouse_id
       JOIN storage_locations sl ON sl.id = qc.storage_location_id
       JOIN users creator ON creator.id = qc.created_by
       ${whereSql}
       ORDER BY qc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    return { items, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id) {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT qc.*,
              p.name AS product_name, p.code AS product_code,
              b.batch_number, b.expiry_date, b.status AS batch_status,
              u.name AS unit_name,
              br.name AS branch_name,
              wh.name AS warehouse_name,
              sl.name AS storage_location_name,
              creator.name AS created_by_name,
              reviewer.name AS reviewed_by_name,
              releaser.name AS released_by_name,
              disposer.name AS disposed_by_name,
              canceller.name AS cancelled_by_name
       FROM quarantine_cases qc
       JOIN products p ON p.id = qc.product_id
       JOIN batches b ON b.id = qc.batch_id
       JOIN units u ON u.id = qc.unit_id
       JOIN branches br ON br.id = qc.branch_id
       JOIN warehouses wh ON wh.id = qc.warehouse_id
       JOIN storage_locations sl ON sl.id = qc.storage_location_id
       JOIN users creator ON creator.id = qc.created_by
       LEFT JOIN users reviewer ON reviewer.id = qc.reviewed_by
       LEFT JOIN users releaser ON releaser.id = qc.released_by
       LEFT JOIN users disposer ON disposer.id = qc.disposed_by
       LEFT JOIN users canceller ON canceller.id = qc.cancelled_by
       WHERE qc.id = ?
       LIMIT 1`,
      [id],
    );

    return rows[0] || null;
  }

  async createQuarantine(data, connection = null) {
    const db = connection || getPool();
    const [res] = await db.query(
      `INSERT INTO quarantine_cases (
         organization_id, branch_id, warehouse_id, storage_location_id,
         quarantine_number, product_id, batch_id, unit_id, quantity,
         source_type, source_id, reason, notes, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.warehouseId,
        data.storageLocationId,
        data.quarantineNumber,
        data.productId,
        data.batchId,
        data.unitId,
        data.quantity,
        data.sourceType || 'manual',
        data.sourceId || null,
        data.reason,
        data.notes || null,
        data.status || 'quarantined',
        data.createdBy,
      ],
    );
    return res.insertId;
  }

  async updateQuarantine(id, fields, connection = null) {
    const db = connection || getPool();
    const sets = [];
    const params = [];

    Object.entries(fields).forEach(([k, v]) => {
      sets.push(`${k} = ?`);
      params.push(v);
    });

    if (sets.length === 0) return;

    params.push(id);
    await db.query(`UPDATE quarantine_cases SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

export default new QuarantineRepository();
