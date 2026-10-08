import { getPool } from '../database/pool.js';

const GR_FIELDS = `
  g.id, g.organization_id, g.branch_id, g.warehouse_id, g.purchase_order_id,
  g.receipt_number, g.receipt_date, g.status, g.received_by, g.notes, g.created_at, g.updated_at
`;

async function list({ search, status, branchId, warehouseId, purchaseOrderId, page = 1, limit = 20, sort = 'created_at', accessibleOrgIds, accessibleBranchIds, accessibleWarehouseIds }) {
  const where = [];
  const params = [];
  if (!accessibleOrgIds?.length && !accessibleBranchIds?.length && !accessibleWarehouseIds?.length) {
    return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  }
  const ors = [];
  if (accessibleOrgIds?.length) { ors.push(`g.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`); params.push(...accessibleOrgIds); }
  if (accessibleBranchIds?.length) { ors.push(`g.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`); params.push(...accessibleBranchIds); }
  if (accessibleWarehouseIds?.length) { ors.push(`g.warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`); params.push(...accessibleWarehouseIds); }
  where.push(`(${ors.join(' OR ')})`);

  if (status) { where.push('g.status = ?'); params.push(status); }
  if (branchId) { where.push('g.branch_id = ?'); params.push(Number(branchId)); }
  if (warehouseId) { where.push('g.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (purchaseOrderId) { where.push('g.purchase_order_id = ?'); params.push(Number(purchaseOrderId)); }
  if (search) {
    where.push('(g.receipt_number LIKE ? OR po.po_number LIKE ? OR s.name LIKE ?)');
    const pct = `%${search}%`;
    params.push(pct, pct, pct);
  }

  const sortMap = { created_at: 'g.created_at', receipt_date: 'g.receipt_date', receipt_number: 'g.receipt_number' };
  const orderColumn = sortMap[sort] || 'g.created_at';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM goods_receipts g
     JOIN purchase_orders po ON po.id = g.purchase_order_id
     JOIN suppliers s ON s.id = po.supplier_id ${whereSql}`,
    params,
  );
  const [items] = await getPool().query(
    `SELECT ${GR_FIELDS}, po.po_number, s.name AS supplier_name, b.name AS branch_name, w.name AS warehouse_name, u.name AS received_by_name
     FROM goods_receipts g
     JOIN purchase_orders po ON po.id = g.purchase_order_id
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = g.branch_id
     JOIN warehouses w ON w.id = g.warehouse_id
     JOIN users u ON u.id = g.received_by
     ${whereSql}
     ORDER BY ${orderColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id) {
  const [rows] = await getPool().query(
    `SELECT ${GR_FIELDS}, po.po_number, s.name AS supplier_name, b.name AS branch_name, w.name AS warehouse_name, u.name AS received_by_name
     FROM goods_receipts g
     JOIN purchase_orders po ON po.id = g.purchase_order_id
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = g.branch_id
     JOIN warehouses w ON w.id = g.warehouse_id
     JOIN users u ON u.id = g.received_by
     WHERE g.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function getLines(goodsReceiptId) {
  const [rows] = await getPool().query(
    `SELECT l.*, p.name AS product_name, u.name AS unit_name, sl.name AS storage_location_name
     FROM goods_receipt_lines l
     JOIN products p ON p.id = l.product_id
     JOIN units u ON u.id = l.unit_id
     LEFT JOIN storage_locations sl ON sl.id = l.storage_location_id
     WHERE l.goods_receipt_id = ? ORDER BY l.id`,
    [goodsReceiptId],
  );
  return rows;
}

async function getReceivedByPoLine(purchaseOrderLineId, excludeReceiptId = null) {
  const params = [purchaseOrderLineId];
  let sql = `SELECT SUM(l.received_quantity) AS total FROM goods_receipt_lines l
             JOIN goods_receipts g ON g.id = l.goods_receipt_id
             WHERE l.purchase_order_line_id = ? AND g.status = 'completed'`;
  if (excludeReceiptId) {
    sql += ' AND g.id <> ?';
    params.push(excludeReceiptId);
  }
  const [rows] = await getPool().query(sql, params);
  return Number(rows[0]?.total || 0);
}

export default { list, findById, getLines, getReceivedByPoLine };
