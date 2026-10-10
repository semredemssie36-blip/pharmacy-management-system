import { getPool } from '../database/pool.js';

const SALE_FIELDS = `
  s.id, s.organization_id, s.branch_id, s.warehouse_id, s.customer_id,
  s.sale_number, s.sale_date, s.status, s.subtotal, s.discount_amount,
  s.total_amount, s.paid_amount, s.payment_status, s.currency, s.notes, s.void_reason, s.cancelled_reason,
  s.created_by, s.created_at, s.updated_at,
  b.name AS branch_name, b.code AS branch_code,
  w.name AS warehouse_name, w.code AS warehouse_code,
  c.name AS customer_name, c.telephone AS customer_phone,
  u.name AS cashier_name, u.email AS cashier_email
`;

const SALE_JOINS = `
  JOIN branches b ON b.id = s.branch_id
  JOIN warehouses w ON w.id = s.warehouse_id
  LEFT JOIN customers c ON c.id = s.customer_id
  JOIN users u ON u.id = s.created_by
`;

async function list({
  search, status, branchId, warehouseId, customerId,
  startDate, endDate, page = 1, limit = 20, sort = 'created_at',
  accessibleOrgIds, accessibleBranchIds, accessibleWarehouseIds,
}) {
  const where = [];
  const params = [];

  if (!accessibleOrgIds?.length && !accessibleBranchIds?.length && !accessibleWarehouseIds?.length) {
    return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  }

  const ors = [];
  if (accessibleOrgIds?.length) {
    ors.push(`s.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
    params.push(...accessibleOrgIds);
  }
  if (accessibleBranchIds?.length) {
    ors.push(`s.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
    params.push(...accessibleBranchIds);
  }
  if (accessibleWarehouseIds?.length) {
    ors.push(`s.warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`);
    params.push(...accessibleWarehouseIds);
  }
  where.push(`(${ors.join(' OR ')})`);

  if (status && status !== 'undefined' && status !== 'null') {
    where.push('s.status = ?');
    params.push(status);
  }
  if (branchId && !isNaN(Number(branchId))) {
    where.push('s.branch_id = ?');
    params.push(Number(branchId));
  }
  if (warehouseId && !isNaN(Number(warehouseId))) {
    where.push('s.warehouse_id = ?');
    params.push(Number(warehouseId));
  }
  if (customerId && !isNaN(Number(customerId))) {
    where.push('s.customer_id = ?');
    params.push(Number(customerId));
  }
  if (startDate && startDate !== 'undefined' && startDate !== 'null') {
    where.push('s.sale_date >= ?');
    params.push(startDate);
  }
  if (endDate && endDate !== 'undefined' && endDate !== 'null') {
    where.push('s.sale_date <= ?');
    params.push(endDate);
  }
  if (search && search !== 'undefined' && search !== 'null') {
    where.push('(s.sale_number LIKE ? OR c.name LIKE ? OR s.notes LIKE ?)');
    const pct = `%${search}%`;
    params.push(pct, pct, pct);
  }

  const sortMap = {
    created_at: 's.created_at',
    sale_date: 's.sale_date',
    sale_number: 's.sale_number',
    total_amount: 's.total_amount',
  };
  const orderColumn = sortMap[sort] || 's.created_at';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM sales s ${SALE_JOINS} ${whereSql}`,
    params,
  );

  const [items] = await getPool().query(
    `SELECT ${SALE_FIELDS} FROM sales s ${SALE_JOINS} ${whereSql} ORDER BY ${orderColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );

  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT ${SALE_FIELDS} FROM sales s ${SALE_JOINS} WHERE s.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findBySaleNumber(organizationId, saleNumber) {
  const [rows] = await getPool().query(
    `SELECT ${SALE_FIELDS} FROM sales s ${SALE_JOINS} WHERE s.organization_id = ? AND s.sale_number = ? LIMIT 1`,
    [organizationId, saleNumber],
  );
  return rows[0] || null;
}

async function getLines(saleId, connection = null) {
  const runner = connection || getPool();
  const [lines] = await runner.query(
    `SELECT sl.id, sl.sale_id, sl.product_id, sl.unit_id, sl.quantity,
            sl.unit_price, sl.discount_amount, sl.line_total, sl.notes, sl.created_at,
            p.name AS product_name, p.code AS product_code, p.barcode AS product_barcode,
            p.prescription_classification, p.controlled_classification, p.antibiotic_classification,
            u.name AS unit_name, u.code AS unit_code
     FROM sale_lines sl
     JOIN products p ON p.id = sl.product_id
     JOIN units u ON u.id = sl.unit_id
     WHERE sl.sale_id = ? ORDER BY sl.id ASC`,
    [saleId],
  );

  if (lines.length === 0) return [];

  const lineIds = lines.map((l) => l.id);
  const [allocations] = await runner.query(
    `SELECT sba.id, sba.sale_line_id, sba.inventory_id, sba.batch_id,
            sba.storage_location_id, sba.quantity, sba.created_at,
            b.batch_number, b.expiry_date,
            sloc.name AS storage_location_name, sloc.code AS storage_location_code
     FROM sale_batch_allocations sba
     JOIN batches b ON b.id = sba.batch_id
     LEFT JOIN storage_locations sloc ON sloc.id = sba.storage_location_id
     WHERE sba.sale_line_id IN (${lineIds.map(() => '?').join(',')})
     ORDER BY sba.id ASC`,
    lineIds,
  );

  const allocMap = new Map();
  for (const a of allocations) {
    if (!allocMap.has(a.sale_line_id)) allocMap.set(a.sale_line_id, []);
    allocMap.get(a.sale_line_id).push(a);
  }

  return lines.map((l) => ({
    ...l,
    allocations: allocMap.get(l.id) || [],
  }));
}

async function getAllocations(saleId, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT sba.id, sba.sale_line_id, sba.inventory_id, sba.batch_id,
            sba.storage_location_id, sba.quantity, sba.created_at,
            b.batch_number, b.expiry_date,
            sl.product_id, sl.unit_id,
            p.name AS product_name, p.code AS product_code
     FROM sale_batch_allocations sba
     JOIN sale_lines sl ON sl.id = sba.sale_line_id
     JOIN batches b ON b.id = sba.batch_id
     JOIN products p ON p.id = sl.product_id
     WHERE sl.sale_id = ?
     ORDER BY sba.id ASC`,
    [saleId],
  );
  return rows;
}

async function createSale(saleData, lines, connection) {
  const [res] = await connection.query(
    `INSERT INTO sales (
      organization_id, branch_id, warehouse_id, customer_id,
      sale_number, sale_date, status, subtotal, discount_amount,
      total_amount, currency, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      saleData.organizationId,
      saleData.branchId,
      saleData.warehouseId,
      saleData.customerId || null,
      saleData.saleNumber,
      saleData.saleDate,
      saleData.status || 'draft',
      saleData.subtotal,
      saleData.discountAmount || 0,
      saleData.totalAmount,
      saleData.currency || 'ETB',
      saleData.notes || null,
      saleData.createdBy,
    ],
  );

  const saleId = res.insertId;

  for (const line of lines) {
    await connection.query(
      `INSERT INTO sale_lines (
        sale_id, product_id, unit_id, quantity, unit_price,
        discount_amount, line_total, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        line.productId,
        line.unitId,
        line.quantity,
        line.unitPrice,
        line.discountAmount || 0,
        line.lineTotal,
        line.notes || null,
      ],
    );
  }

  return saleId;
}

async function updateSale(id, saleData, lines, connection) {
  await connection.query(
    `UPDATE sales SET
      customer_id = ?,
      sale_date = ?,
      subtotal = ?,
      discount_amount = ?,
      total_amount = ?,
      currency = ?,
      notes = ?
     WHERE id = ?`,
    [
      saleData.customerId || null,
      saleData.saleDate,
      saleData.subtotal,
      saleData.discountAmount || 0,
      saleData.totalAmount,
      saleData.currency || 'ETB',
      saleData.notes || null,
      id,
    ],
  );

  // Recreate lines
  await connection.query('DELETE FROM sale_lines WHERE sale_id = ?', [id]);
  for (const line of lines) {
    await connection.query(
      `INSERT INTO sale_lines (
        sale_id, product_id, unit_id, quantity, unit_price,
        discount_amount, line_total, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        line.productId,
        line.unitId,
        line.quantity,
        line.unitPrice,
        line.discountAmount || 0,
        line.lineTotal,
        line.notes || null,
      ],
    );
  }
}

async function updateStatus(id, status, extraFields = {}, connection = null) {
  const runner = connection || getPool();
  const sets = ['status = ?'];
  const params = [status];

  if (extraFields.voidReason !== undefined) {
    sets.push('void_reason = ?');
    params.push(extraFields.voidReason);
  }
  if (extraFields.cancelledReason !== undefined) {
    sets.push('cancelled_reason = ?');
    params.push(extraFields.cancelledReason);
  }

  params.push(id);
  await runner.query(`UPDATE sales SET ${sets.join(', ')} WHERE id = ?`, params);
}

export default {
  list,
  findById,
  findBySaleNumber,
  getLines,
  getAllocations,
  createSale,
  updateSale,
  updateStatus,
};
