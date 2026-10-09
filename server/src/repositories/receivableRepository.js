import { getPool } from '../database/pool.js';

export const receivableRepository = {
  async listReceivables({
    organizationId,
    branchId,
    customerId,
    status,
    overdueOnly,
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
    if (status) {
      whereClauses.push('cr.status = ?');
      params.push(status);
    }
    if (overdueOnly) {
      whereClauses.push('cr.due_date IS NOT NULL AND cr.due_date < CURDATE() AND cr.status IN ("unpaid", "partially_paid")');
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(cr.receivable_number LIKE ? OR c.name LIKE ? OR c.code LIKE ?)');
      params.push(term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM customer_receivables cr
       JOIN customers c ON c.id = cr.customer_id
       WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [items] = await pool.query(
      `SELECT cr.id, cr.organization_id, cr.branch_id, cr.customer_id,
              cr.receivable_number, cr.reference_type, cr.reference_id,
              cr.total_amount, cr.paid_amount, cr.balance_amount, cr.due_date,
              cr.status, cr.notes, cr.created_by, cr.created_at, cr.updated_at,
              c.name AS customer_name,
              c.code AS customer_code,
              c.credit_limit,
              b.name AS branch_name,
              u.name AS created_by_name,
              CASE
                WHEN cr.reference_type = 'sale' THEN s.sale_number
                WHEN cr.reference_type = 'dispensing' THEN d.dispensing_number
                ELSE NULL
              END AS reference_number
       FROM customer_receivables cr
       JOIN customers c ON c.id = cr.customer_id
       JOIN branches b ON b.id = cr.branch_id
       JOIN users u ON u.id = cr.created_by
       LEFT JOIN sales s ON cr.reference_type = 'sale' AND s.id = cr.reference_id
       LEFT JOIN dispensings d ON cr.reference_type = 'dispensing' AND d.id = cr.reference_id
       WHERE ${whereSql}
       ORDER BY cr.id DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    );

    return { items, total };
  },

  async findById(id, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT cr.id, cr.organization_id, cr.branch_id, cr.customer_id,
              cr.receivable_number, cr.reference_type, cr.reference_id,
              cr.total_amount, cr.paid_amount, cr.balance_amount, cr.due_date,
              cr.status, cr.notes, cr.created_by, cr.created_at, cr.updated_at,
              c.name AS customer_name,
              c.code AS customer_code,
              c.credit_limit,
              c.telephone AS customer_telephone,
              c.email AS customer_email,
              b.name AS branch_name,
              u.name AS created_by_name,
              CASE
                WHEN cr.reference_type = 'sale' THEN s.sale_number
                WHEN cr.reference_type = 'dispensing' THEN d.dispensing_number
                ELSE NULL
              END AS reference_number
       FROM customer_receivables cr
       JOIN customers c ON c.id = cr.customer_id
       JOIN branches b ON b.id = cr.branch_id
       JOIN users u ON u.id = cr.created_by
       LEFT JOIN sales s ON cr.reference_type = 'sale' AND s.id = cr.reference_id
       LEFT JOIN dispensings d ON cr.reference_type = 'dispensing' AND d.id = cr.reference_id
       WHERE cr.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async findByIdForUpdate(id, connection) {
    if (!connection) throw new Error('findByIdForUpdate requires an active connection');
    const [rows] = await connection.query(
      `SELECT cr.id, cr.organization_id, cr.branch_id, cr.customer_id,
              cr.receivable_number, cr.reference_type, cr.reference_id,
              cr.total_amount, cr.paid_amount, cr.balance_amount, cr.due_date,
              cr.status, cr.notes, cr.created_by, cr.created_at, cr.updated_at
       FROM customer_receivables cr
       WHERE cr.id = ?
       LIMIT 1
       FOR UPDATE`,
      [id],
    );
    return rows[0] || null;
  },

  async findByReference(referenceType, referenceId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT cr.id, cr.organization_id, cr.branch_id, cr.customer_id,
              cr.receivable_number, cr.reference_type, cr.reference_id,
              cr.total_amount, cr.paid_amount, cr.balance_amount, cr.due_date,
              cr.status, cr.notes, cr.created_by, cr.created_at, cr.updated_at
       FROM customer_receivables cr
       WHERE cr.reference_type = ? AND cr.reference_id = ?
       LIMIT 1`,
      [referenceType, referenceId],
    );
    return rows[0] || null;
  },

  async createReceivable(data, connection) {
    const runner = connection || getPool();
    const [result] = await runner.query(
      `INSERT INTO customer_receivables (
         organization_id, branch_id, customer_id, receivable_number,
         reference_type, reference_id, total_amount, paid_amount,
         balance_amount, due_date, status, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.branchId,
        data.customerId,
        data.receivableNumber,
        data.referenceType,
        data.referenceId,
        data.totalAmount,
        data.paidAmount || 0,
        data.balanceAmount,
        data.dueDate || null,
        data.status || 'unpaid',
        data.notes || null,
        data.createdBy,
      ],
    );
    return result.insertId;
  },

  async updateReceivable(id, data, connection) {
    const runner = connection || getPool();
    const fields = [];
    const values = [];

    if (data.paidAmount !== undefined) {
      fields.push('paid_amount = ?');
      values.push(data.paidAmount);
    }
    if (data.balanceAmount !== undefined) {
      fields.push('balance_amount = ?');
      values.push(data.balanceAmount);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.dueDate !== undefined) {
      fields.push('due_date = ?');
      values.push(data.dueDate);
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?');
      values.push(data.notes);
    }

    if (fields.length === 0) return 0;

    values.push(id);
    const [result] = await runner.query(
      `UPDATE customer_receivables SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    return result.affectedRows;
  },

  async getCustomerBalance(customerId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT IFNULL(SUM(balance_amount), 0) AS outstanding_balance
       FROM customer_receivables
       WHERE customer_id = ? AND status IN ('unpaid', 'partially_paid')`,
      [customerId],
    );
    return Number(rows[0]?.outstanding_balance || 0);
  },

  async getCustomerBalanceForUpdate(customerId, connection) {
    if (!connection) throw new Error('getCustomerBalanceForUpdate requires an active connection');
    const [rows] = await connection.query(
      `SELECT IFNULL(SUM(balance_amount), 0) AS outstanding_balance
       FROM customer_receivables
       WHERE customer_id = ? AND status IN ('unpaid', 'partially_paid')
       FOR UPDATE`,
      [customerId],
    );
    return Number(rows[0]?.outstanding_balance || 0);
  },

  async getCustomerReceivables(customerId, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT cr.id, cr.receivable_number, cr.reference_type, cr.reference_id,
              cr.total_amount, cr.paid_amount, cr.balance_amount, cr.due_date,
              cr.status, cr.created_at
       FROM customer_receivables cr
       WHERE cr.customer_id = ?
       ORDER BY cr.id DESC`,
      [customerId],
    );
    return rows;
  },
};

export default receivableRepository;
