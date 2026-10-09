import { getPool } from '../database/pool.js';

export const stockTransferRepository = {
  async listStockTransfers({
    organizationId,
    sourceBranchId,
    destinationBranchId,
    sourceWarehouseId,
    destinationWarehouseId,
    status,
    search,
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
      whereClauses.push('st.organization_id = ?');
      params.push(organizationId);
    } else if (accessibleOrgIds?.length || accessibleBranchIds?.length || accessibleWarehouseIds?.length) {
      const ors = [];
      if (accessibleOrgIds?.length) {
        ors.push(`st.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
        params.push(...accessibleOrgIds);
      }
      if (accessibleBranchIds?.length) {
        ors.push(`st.source_branch_id IN (${accessibleBranchIds.map(() => '?').join(',')}) OR st.destination_branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
        params.push(...accessibleBranchIds, ...accessibleBranchIds);
      }
      if (accessibleWarehouseIds?.length) {
        ors.push(`st.source_warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')}) OR st.destination_warehouse_id IN (${accessibleWarehouseIds.map(() => '?').join(',')})`);
        params.push(...accessibleWarehouseIds, ...accessibleWarehouseIds);
      }
      whereClauses.push(`(${ors.join(' OR ')})`);
    } else {
      return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
    }

    if (sourceBranchId) {
      whereClauses.push('st.source_branch_id = ?');
      params.push(sourceBranchId);
    }
    if (destinationBranchId) {
      whereClauses.push('st.destination_branch_id = ?');
      params.push(destinationBranchId);
    }
    if (sourceWarehouseId) {
      whereClauses.push('st.source_warehouse_id = ?');
      params.push(sourceWarehouseId);
    }
    if (destinationWarehouseId) {
      whereClauses.push('st.destination_warehouse_id = ?');
      params.push(destinationWarehouseId);
    }
    if (status) {
      whereClauses.push('st.status = ?');
      params.push(status);
    }
    if (search) {
      whereClauses.push('(st.transfer_number LIKE ? OR sb.name LIKE ? OR db.name LIKE ? OR sw.name LIKE ? OR dw.name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(st.id) AS total
       FROM stock_transfers st
       JOIN branches sb ON sb.id = st.source_branch_id
       JOIN branches db ON db.id = st.destination_branch_id
       JOIN warehouses sw ON sw.id = st.source_warehouse_id
       JOIN warehouses dw ON dw.id = st.destination_warehouse_id
       ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const [items] = await pool.query(
      `SELECT
         st.id,
         st.organization_id,
         st.source_branch_id,
         st.source_warehouse_id,
         st.destination_branch_id,
         st.destination_warehouse_id,
         st.transfer_number,
         st.status,
         st.reason,
         st.notes,
         st.has_discrepancy,
         st.discrepancy_resolved,
         st.created_at,
         st.updated_at,
         st.requested_by,
         st.approved_by,
         st.approved_at,
         st.dispatched_by,
         st.dispatched_at,
         st.received_by,
         st.received_at,
         st.cancelled_by,
         st.cancelled_at,
         sb.name AS source_branch_name,
         sb.code AS source_branch_code,
         sw.name AS source_warehouse_name,
         sw.code AS source_warehouse_code,
         db.name AS destination_branch_name,
         db.code AS destination_branch_code,
         dw.name AS destination_warehouse_name,
         dw.code AS destination_warehouse_code,
         ru.name AS requested_by_name,
         au.name AS approved_by_name,
         du.name AS dispatched_by_name,
         rcu.name AS received_by_name,
         (SELECT COUNT(*) FROM stock_transfer_lines stl WHERE stl.transfer_id = st.id) AS line_count,
         (SELECT COALESCE(SUM(stl.quantity_requested), 0) FROM stock_transfer_lines stl WHERE stl.transfer_id = st.id) AS total_quantity_requested,
         (SELECT COALESCE(SUM(stl.quantity_dispatched), 0) FROM stock_transfer_lines stl WHERE stl.transfer_id = st.id) AS total_quantity_dispatched,
         (SELECT COALESCE(SUM(stl.quantity_received), 0) FROM stock_transfer_lines stl WHERE stl.transfer_id = st.id) AS total_quantity_received
       FROM stock_transfers st
       JOIN branches sb ON sb.id = st.source_branch_id
       JOIN branches db ON db.id = st.destination_branch_id
       JOIN warehouses sw ON sw.id = st.source_warehouse_id
       JOIN warehouses dw ON dw.id = st.destination_warehouse_id
       JOIN users ru ON ru.id = st.requested_by
       LEFT JOIN users au ON au.id = st.approved_by
       LEFT JOIN users du ON du.id = st.dispatched_by
       LEFT JOIN users rcu ON rcu.id = st.received_by
       ${whereSql}
       ORDER BY st.id DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset],
    );

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
    };
  },

  async findById(id, connection = null) {
    const db = connection || getPool();
    const [rows] = await db.query(
      'SELECT * FROM stock_transfers WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  },

  async findWithDetails(id, connection = null) {
    const db = connection || getPool();
    const [headerRows] = await db.query(
      `SELECT
         st.*,
         o.name AS organization_name,
         sb.name AS source_branch_name,
         sb.code AS source_branch_code,
         sw.name AS source_warehouse_name,
         sw.code AS source_warehouse_code,
         db.name AS destination_branch_name,
         db.code AS destination_branch_code,
         dw.name AS destination_warehouse_name,
         dw.code AS destination_warehouse_code,
         ru.name AS requested_by_name,
         au.name AS approved_by_name,
         rju.name AS rejected_by_name,
         du.name AS dispatched_by_name,
         rcu.name AS received_by_name,
         cu.name AS cancelled_by_name,
         dru.name AS discrepancy_resolved_by_name
       FROM stock_transfers st
       JOIN organizations o ON o.id = st.organization_id
       JOIN branches sb ON sb.id = st.source_branch_id
       JOIN branches db ON db.id = st.destination_branch_id
       JOIN warehouses sw ON sw.id = st.source_warehouse_id
       JOIN warehouses dw ON dw.id = st.destination_warehouse_id
       JOIN users ru ON ru.id = st.requested_by
       LEFT JOIN users au ON au.id = st.approved_by
       LEFT JOIN users rju ON rju.id = st.rejected_by
       LEFT JOIN users du ON du.id = st.dispatched_by
       LEFT JOIN users rcu ON rcu.id = st.received_by
       LEFT JOIN users cu ON cu.id = st.cancelled_by
       LEFT JOIN users dru ON dru.id = st.discrepancy_resolved_by
       WHERE st.id = ?
       LIMIT 1`,
      [id],
    );
    const header = headerRows[0] || null;
    if (!header) return null;

    const [lines] = await db.query(
      `SELECT
         stl.*,
         p.name AS product_name,
         p.code AS product_code,
         u.name AS unit_name,
         u.code AS unit_code
       FROM stock_transfer_lines stl
       JOIN products p ON p.id = stl.product_id
       JOIN units u ON u.id = stl.unit_id
       WHERE stl.transfer_id = ?
       ORDER BY stl.id ASC`,
      [id],
    );

    const [allocations] = await db.query(
      `SELECT
         stba.*,
         b.batch_number,
         b.expiry_date,
         b.status AS batch_status,
         sl_src.name AS source_location_name,
         sl_src.code AS source_location_code,
         sl_dst.name AS destination_location_name,
         sl_dst.code AS destination_location_code
       FROM stock_transfer_batch_allocations stba
       JOIN batches b ON b.id = stba.batch_id
       JOIN storage_locations sl_src ON sl_src.id = stba.source_storage_location_id
       LEFT JOIN storage_locations sl_dst ON sl_dst.id = stba.destination_storage_location_id
       WHERE stba.transfer_id = ?
       ORDER BY stba.id ASC`,
      [id],
    );

    return {
      ...header,
      lines: lines.map((l) => ({
        ...l,
        batch_allocations: allocations.filter((a) => a.transfer_line_id === l.id),
      })),
      batch_allocations: allocations,
    };
  },

  async createTransfer(data, connection) {
    const [res] = await connection.query(
      `INSERT INTO stock_transfers (
         organization_id, source_branch_id, source_warehouse_id,
         destination_branch_id, destination_warehouse_id, transfer_number,
         status, reason, notes, requested_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.organizationId,
        data.sourceBranchId,
        data.sourceWarehouseId,
        data.destinationBranchId,
        data.destinationWarehouseId,
        data.transferNumber,
        data.status || 'draft',
        data.reason || null,
        data.notes || null,
        data.requestedBy,
      ],
    );
    return res.insertId;
  },

  async createTransferLines(lines, connection) {
    if (!lines.length) return [];
    const insertedIds = [];
    for (const line of lines) {
      const [res] = await connection.query(
        `INSERT INTO stock_transfer_lines (
           transfer_id, product_id, unit_id, quantity_requested,
           quantity_approved, quantity_dispatched, quantity_received,
           quantity_in_transit, quantity_discrepancy, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          line.transferId,
          line.productId,
          line.unitId,
          line.quantityRequested,
          line.quantityApproved || 0,
          line.quantityDispatched || 0,
          line.quantityReceived || 0,
          line.quantityInTransit || 0,
          line.quantityDiscrepancy || 0,
          line.notes || null,
        ],
      );
      insertedIds.push(res.insertId);
    }
    return insertedIds;
  },

  async createBatchAllocations(allocations, connection) {
    if (!allocations.length) return [];
    const insertedIds = [];
    for (const alloc of allocations) {
      const [res] = await connection.query(
        `INSERT INTO stock_transfer_batch_allocations (
           transfer_id, transfer_line_id, batch_id, source_storage_location_id,
           destination_storage_location_id, quantity_allocated, quantity_dispatched,
           quantity_received, quantity_discrepancy, discrepancy_reason, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          alloc.transferId,
          alloc.transferLineId,
          alloc.batchId,
          alloc.sourceStorageLocationId,
          alloc.destinationStorageLocationId || null,
          alloc.quantityAllocated,
          alloc.quantityDispatched || 0,
          alloc.quantityReceived || 0,
          alloc.quantityDiscrepancy || 0,
          alloc.discrepancyReason || null,
          alloc.status || 'allocated',
        ],
      );
      insertedIds.push(res.insertId);
    }
    return insertedIds;
  },

  async updateTransfer(id, data, connection) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    if (!fields.length) return;
    params.push(id);
    await connection.query(
      `UPDATE stock_transfers SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
  },

  async updateTransferLine(id, data, connection) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    if (!fields.length) return;
    params.push(id);
    await connection.query(
      `UPDATE stock_transfer_lines SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
  },

  async updateBatchAllocation(id, data, connection) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
    if (!fields.length) return;
    params.push(id);
    await connection.query(
      `UPDATE stock_transfer_batch_allocations SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );
  },

  async deleteTransferLines(transferId, connection) {
    await connection.query('DELETE FROM stock_transfer_lines WHERE transfer_id = ?', [transferId]);
  },

  async getAvailableBatchesForWarehouse(warehouseId, productId, connection = null) {
    const db = connection || getPool();
    const [rows] = await db.query(
      `SELECT
         i.id AS inventory_id,
         i.product_id,
         i.batch_id,
         i.unit_id,
         i.storage_location_id,
         i.quantity AS available_quantity,
         b.batch_number,
         b.expiry_date,
         b.status AS batch_status,
         sl.name AS storage_location_name,
         sl.code AS storage_location_code,
         u.name AS unit_name,
         u.code AS unit_code
       FROM inventory i
       JOIN batches b ON b.id = i.batch_id
       JOIN storage_locations sl ON sl.id = i.storage_location_id
       JOIN units u ON u.id = i.unit_id
       WHERE i.warehouse_id = ?
         AND i.product_id = ?
         AND i.status = 'available'
         AND i.quantity > 0
         AND b.status = 'active'
         AND b.expiry_date > CURDATE()
       ORDER BY b.expiry_date ASC, i.id ASC`,
      [warehouseId, productId],
    );
    return rows;
  },
};

export default stockTransferRepository;
