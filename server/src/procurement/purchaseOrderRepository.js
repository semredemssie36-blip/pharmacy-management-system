import { getPool } from '../database/pool.js';

const PO_FIELDS = `
  po.id, po.organization_id, po.branch_id, po.supplier_id, po.po_number, po.order_date,
  po.expected_delivery_date, po.status, po.currency, po.notes, po.total_amount,
  po.rejection_reason, po.cancelled_reason, po.created_by, po.created_at, po.updated_at`;

async function list({ search, status, supplierId, branchId, page = 1, limit = 20, sort = 'created_at', accessibleOrgIds, accessibleBranchIds }) {
  const where = [];
  const params = [];
  if ((!accessibleOrgIds || accessibleOrgIds.length === 0) && (!accessibleBranchIds || accessibleBranchIds.length === 0)) {
    return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
  }
  const ors = [];
  if (accessibleOrgIds?.length) { ors.push(`po.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`); params.push(...accessibleOrgIds); }
  if (accessibleBranchIds?.length) { ors.push(`po.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`); params.push(...accessibleBranchIds); }
  where.push(`(${ors.join(' OR ')})`);

  if (status) { where.push('po.status = ?'); params.push(status); }
  if (supplierId) { where.push('po.supplier_id = ?'); params.push(Number(supplierId)); }
  if (branchId) { where.push('po.branch_id = ?'); params.push(Number(branchId)); }
  if (search) {
    where.push('(po.po_number LIKE ? OR s.name LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s);
  }

  const sortMap = { created_at: 'po.created_at', po_number: 'po.po_number', total_amount: 'po.total_amount', order_date: 'po.order_date' };
  const orderColumn = sortMap[sort] || 'po.created_at';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ${whereSql}`,
    params,
  );
  const [items] = await getPool().query(
    `SELECT ${PO_FIELDS}, s.name AS supplier_name, b.name AS branch_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = po.branch_id
     ${whereSql}
     ORDER BY ${orderColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );
  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id) {
  const [rows] = await getPool().query(
    `SELECT ${PO_FIELDS}, s.name AS supplier_name, b.name AS branch_name
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN branches b ON b.id = po.branch_id
     WHERE po.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function getLines(purchaseOrderId) {
  const [rows] = await getPool().query(
    `SELECT l.id, l.purchase_order_id, l.product_id, l.unit_id, l.ordered_quantity, l.unit_price, l.line_total, l.notes, l.created_at,
            p.name AS product_name, p.code AS product_code, u.name AS unit_name
     FROM purchase_order_lines l
     JOIN products p ON p.id = l.product_id
     JOIN units u ON u.id = l.unit_id
     WHERE l.purchase_order_id = ? ORDER BY l.id`,
    [purchaseOrderId],
  );
  return rows;
}

async function findByPoNumber(organizationId, poNumber) {
  const [rows] = await getPool().query(
    'SELECT id FROM purchase_orders WHERE organization_id = ? AND po_number = ? LIMIT 1',
    [organizationId, poNumber],
  );
  return rows[0] || null;
}

export default { list, findById, getLines, findByPoNumber };
