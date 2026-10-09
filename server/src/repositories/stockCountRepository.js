import { getPool } from '../database/pool.js';

export const stockCountRepository = {
  async listStockCounts({
    organizationId,
    branchId,
    warehouseId,
    storageLocationId,
    status,
    countType,
    search,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    accessibleOrgIds,
    accessibleBranchIds,
    accessibleWarehouseIds,
  }) {
    const pool = getPool();
    const whereClauses = [];
    const params = [];

    if (organizationId) {
      whereClauses.push('sc.organization_id = ?');
      params.push(organizationId);
    } else if (accessibleOrgIds?.length || accessibleBranchIds?.length || accessibleWarehouseIds?.length) {
      const ors = [];
      if (accessibleOrgIds?.length) {
        ors.push(`sc.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
        params.push(...accessibleOrgIds);
      }
      if (accessibleBranchIds?.length) {
        ors.push(`sc.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
        params.push(...accessibleBranchIds);
      }
      if (accessibleWarehouseIds?.length) {
        ors.push(`sc.warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`);
        params.push(...accessibleWarehouseIds);
      }
      whereClauses.push(`(${ors.join(' OR ')})`);
    } else {
      return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
    }

    if (branchId) {
      whereClauses.push('sc.branch_id = ?');
      params.push(branchId);
    }
    if (warehouseId) {
      whereClauses.push('sc.warehouse_id = ?');
      params.push(warehouseId);
    }
    if (storageLocationId) {
      whereClauses.push('sc.storage_location_id = ?');
      params.push(storageLocationId);
    }
    if (status) {
      whereClauses.push('sc.status = ?');
      params.push(status);
    }
    if (countType) {
      whereClauses.push('sc.count_type = ?');
      params.push(countType);
    }
    if (startDate) {
      whereClauses.push('sc.created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('sc.created_at <= ?');
      params.push(endDate);
    }
    if (search) {
      whereClauses.push('(sc.count_number LIKE ? OR w.name LIKE ? OR b.name LIKE ? OR sc.notes LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(DISTINCT sc.id) as total
      FROM stock_counts sc
      JOIN branches b ON sc.branch_id = b.id
      JOIN warehouses w ON sc.warehouse_id = w.id
      ${whereSql}
    `;

    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const querySql = `
      SELECT
        sc.id,
        sc.count_number,
        sc.organization_id,
        sc.branch_id,
        b.name AS branch_name,
        b.code AS branch_code,
        sc.warehouse_id,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        sc.storage_location_id,
        sl.name AS storage_location_name,
        sc.count_type,
        sc.status,
        sc.notes,
        sc.snapshot_at,
        sc.created_at,
        u_create.name AS created_by_name,
        sc.started_at,
        u_start.name AS started_by_name,
        sc.submitted_at,
        u_sub.name AS submitted_by_name,
        sc.approved_at,
        u_app.name AS approved_by_name,
        sc.applied_at,
        u_apply.name AS applied_by_name,
        COUNT(scl.id) AS total_items,
        SUM(CASE WHEN scl.is_counted = 1 THEN 1 ELSE 0 END) AS total_counted_items,
        SUM(CASE WHEN scl.is_counted = 1 AND scl.variance_quantity != 0 THEN 1 ELSE 0 END) AS total_discrepancy_items,
        SUM(CASE WHEN scl.variance_quantity > 0 THEN scl.variance_quantity ELSE 0 END) AS total_positive_variance,
        SUM(CASE WHEN scl.variance_quantity < 0 THEN scl.variance_quantity ELSE 0 END) AS total_negative_variance
      FROM stock_counts sc
      JOIN branches b ON sc.branch_id = b.id
      JOIN warehouses w ON sc.warehouse_id = w.id
      LEFT JOIN storage_locations sl ON sc.storage_location_id = sl.id
      LEFT JOIN users u_create ON sc.created_by = u_create.id
      LEFT JOIN users u_start ON sc.started_by = u_start.id
      LEFT JOIN users u_sub ON sc.submitted_by = u_sub.id
      LEFT JOIN users u_app ON sc.approved_by = u_app.id
      LEFT JOIN users u_apply ON sc.applied_by = u_apply.id
      LEFT JOIN stock_count_lines scl ON sc.id = scl.stock_count_id
      ${whereSql}
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(querySql, [...params, Number(limit), Number(offset)]);
    return {
      items: rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    };
  },

  async findById(id, connection) {
    const conn = connection || getPool();
    const [rows] = await conn.query(
      `SELECT
        sc.*,
        b.name AS branch_name,
        b.code AS branch_code,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        sl.name AS storage_location_name,
        u_create.name AS created_by_name,
        u_start.name AS started_by_name,
        u_sub.name AS submitted_by_name,
        u_app.name AS approved_by_name,
        u_apply.name AS applied_by_name
       FROM stock_counts sc
       JOIN branches b ON sc.branch_id = b.id
       JOIN warehouses w ON sc.warehouse_id = w.id
       LEFT JOIN storage_locations sl ON sc.storage_location_id = sl.id
       LEFT JOIN users u_create ON sc.created_by = u_create.id
       LEFT JOIN users u_start ON sc.started_by = u_start.id
       LEFT JOIN users u_sub ON sc.submitted_by = u_sub.id
       LEFT JOIN users u_app ON sc.approved_by = u_app.id
       LEFT JOIN users u_apply ON sc.applied_by = u_apply.id
       WHERE sc.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async findWithDetails(id, connection) {
    const count = await this.findById(id, connection);
    if (!count) return null;

    const conn = connection || getPool();

    // Fetch lines
    const [lines] = await conn.query(
      `SELECT
        scl.*,
        p.name AS product_name,
        p.code AS product_code,
        b.batch_number,
        b.expiry_date,
        b.status AS batch_status,
        u.name AS unit_name,
        u.code AS unit_code,
        sl.name AS storage_location_name,
        sl.code AS storage_location_code,
        counter.name AS counted_by_name
       FROM stock_count_lines scl
       JOIN products p ON scl.product_id = p.id
       JOIN batches b ON scl.batch_id = b.id
       JOIN units u ON scl.unit_id = u.id
       JOIN storage_locations sl ON scl.storage_location_id = sl.id
       LEFT JOIN users counter ON scl.counted_by = counter.id
       WHERE scl.stock_count_id = ?
       ORDER BY sl.name ASC, p.name ASC, b.expiry_date ASC`,
      [id],
    );

    // Fetch line events (revisions, recounts)
    const [events] = await conn.query(
      `SELECT
        e.*,
        u.name AS performed_by_name,
        p.name AS product_name,
        b.batch_number
       FROM stock_count_line_events e
       JOIN stock_count_lines scl ON e.stock_count_line_id = scl.id
       JOIN products p ON scl.product_id = p.id
       JOIN batches b ON scl.batch_id = b.id
       JOIN users u ON e.performed_by = u.id
       WHERE scl.stock_count_id = ?
       ORDER BY e.created_at ASC`,
      [id],
    );

    // Fetch stock movements if adjustments were applied
    const [movements] = await conn.query(
      `SELECT
        sm.*,
        p.name AS product_name,
        p.code AS product_code,
        b.batch_number,
        w.name AS warehouse_name,
        sl.name AS storage_location_name,
        u.name AS performed_by_name
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       JOIN batches b ON sm.batch_id = b.id
       JOIN warehouses w ON sm.warehouse_id = w.id
       JOIN storage_locations sl ON sm.storage_location_id = sl.id
       JOIN users u ON sm.created_by = u.id
       WHERE sm.reference_type = 'stock_count' AND sm.reference_id = ?
       ORDER BY sm.created_at ASC`,
      [id],
    );

    return {
      ...count,
      lines,
      events,
      movements,
    };
  },

  async createStockCount(data, connection) {
    const conn = connection || getPool();
    const countNumber = `SC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [result] = await conn.query(
      `INSERT INTO stock_counts (
        count_number, organization_id, branch_id, warehouse_id,
        storage_location_id, count_type, status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        countNumber,
        data.organizationId,
        data.branchId,
        data.warehouseId,
        data.storageLocationId || null,
        data.countType || 'full',
        data.status || 'draft',
        data.notes || null,
        data.userId,
      ],
    );

    return { id: result.insertId, countNumber };
  },

  async updateStockCount(id, fields, connection) {
    const conn = connection || getPool();
    const setClauses = [];
    const values = [];

    const allowed = [
      'status', 'notes', 'snapshot_at', 'started_by', 'started_at',
      'submitted_by', 'submitted_at', 'approved_by', 'approved_at',
      'approval_notes', 'rejection_reason', 'cancellation_reason',
      'applied_by', 'applied_at',
    ];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (setClauses.length === 0) return;

    values.push(id);
    await conn.query(`UPDATE stock_counts SET ${setClauses.join(', ')} WHERE id = ?`, values);
  },

  async findEligibleInventoryForSnapshot({ organizationId, branchId, warehouseId, storageLocationId, productIds }, connection) {
    const conn = connection || getPool();
    const whereClauses = [
      'inv.organization_id = ?',
      'inv.branch_id = ?',
      'inv.warehouse_id = ?',
    ];
    const params = [organizationId, branchId, warehouseId];

    if (storageLocationId) {
      whereClauses.push('inv.storage_location_id = ?');
      params.push(storageLocationId);
    }

    if (productIds && productIds.length > 0) {
      whereClauses.push(`inv.product_id IN (${productIds.map(() => '?').join(',')})`);
      params.push(...productIds);
    }

    const sql = `
      SELECT
        inv.id AS inventory_id,
        inv.organization_id,
        inv.branch_id,
        inv.warehouse_id,
        inv.storage_location_id,
        inv.product_id,
        inv.batch_id,
        inv.unit_id,
        inv.status AS inventory_status,
        inv.quantity AS system_quantity,
        b.expiry_date,
        b.status AS batch_status
      FROM inventory inv
      JOIN batches b ON inv.batch_id = b.id
      JOIN products p ON inv.product_id = p.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY inv.storage_location_id ASC, inv.product_id ASC, b.expiry_date ASC
    `;

    const [rows] = await conn.query(sql, params);
    return rows;
  },

  async insertCountLines(stockCountId, lines, connection) {
    const conn = connection || getPool();
    if (!lines || lines.length === 0) return;

    const values = [];
    const placeholders = [];

    for (const line of lines) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        stockCountId,
        line.storageLocationId,
        line.productId,
        line.batchId,
        line.unitId,
        line.inventoryStatus || 'available',
        line.systemQuantity || 0,
        line.countedQuantity !== undefined ? line.countedQuantity : null,
        line.isCounted ? 1 : 0,
        line.varianceQuantity !== undefined ? line.varianceQuantity : null,
        line.varianceReason || null,
        line.notes || null,
      );
    }

    const sql = `
      INSERT INTO stock_count_lines (
        stock_count_id, storage_location_id, product_id, batch_id, unit_id,
        inventory_status, system_quantity, counted_quantity, is_counted,
        variance_quantity, variance_reason, notes
      ) VALUES ${placeholders.join(', ')}
      ON DUPLICATE KEY UPDATE
        system_quantity = VALUES(system_quantity)
    `;

    await conn.query(sql, values);
  },

  async updateCountLine(lineId, fields, connection) {
    const conn = connection || getPool();
    const setClauses = [];
    const values = [];

    const allowed = [
      'counted_quantity', 'is_counted', 'variance_quantity',
      'variance_reason', 'notes', 'counted_by', 'counted_at',
      'recount_requested', 'recount_notes',
    ];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (setClauses.length === 0) return;

    values.push(lineId);
    await conn.query(`UPDATE stock_count_lines SET ${setClauses.join(', ')} WHERE id = ?`, values);
  },

  async insertLineEvent(data, connection) {
    const conn = connection || getPool();
    await conn.query(
      `INSERT INTO stock_count_line_events (
        stock_count_line_id, event_type, previous_counted_quantity,
        new_counted_quantity, reason, performed_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.stockCountLineId,
        data.eventType,
        data.previousCountedQuantity !== undefined ? data.previousCountedQuantity : null,
        data.newCountedQuantity,
        data.reason || null,
        data.performedBy,
      ],
    );
  },

  async getLineById(lineId, connection) {
    const conn = connection || getPool();
    const [rows] = await conn.query('SELECT * FROM stock_count_lines WHERE id = ? LIMIT 1', [lineId]);
    return rows[0] || null;
  },
};

export default stockCountRepository;
