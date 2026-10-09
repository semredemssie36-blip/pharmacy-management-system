import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import inventoryService from './inventoryService.js';
import { getPool } from '../database/pool.js';

export class ExpiryService {
  async #resolveScope(userId) {
    const scope = await authorizationService.getUserScope(userId);
    return {
      organizationIds: [...scope.organizationIds],
      branchIds: [...scope.branchIds],
      warehouseIds: [...scope.warehouseIds],
    };
  }

  async getSummary(userId) {
    const db = getPool();
    const scope = await this.#resolveScope(userId);
    const params = [];
    const whereClauses = [];

    if (scope.organizationIds.length > 0) {
      whereClauses.push(`inv.organization_id IN (${scope.organizationIds.map(() => '?').join(',')})`);
      params.push(...scope.organizationIds);
    }
    if (scope.branchIds.length > 0) {
      whereClauses.push(`inv.branch_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds);
    }
    if (scope.warehouseIds.length > 0) {
      whereClauses.push(`inv.warehouse_id IN (${scope.warehouseIds.map(() => '?').join(',')})`);
      params.push(...scope.warehouseIds);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN b.expiry_date <= CURDATE() AND inv.quantity > 0 THEN b.id END) AS expired_batches_count,
         COALESCE(SUM(CASE WHEN b.expiry_date <= CURDATE() THEN inv.quantity ELSE 0 END), 0) AS expired_units_total,
         COUNT(DISTINCT CASE WHEN b.expiry_date > CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND inv.quantity > 0 THEN b.id END) AS near_expiry_30_count,
         COUNT(DISTINCT CASE WHEN b.expiry_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) AND inv.quantity > 0 THEN b.id END) AS near_expiry_60_count,
         COUNT(DISTINCT CASE WHEN b.expiry_date > DATE_ADD(CURDATE(), INTERVAL 60 DAY) AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) AND inv.quantity > 0 THEN b.id END) AS near_expiry_90_count,
         COALESCE(SUM(CASE WHEN b.expiry_date > CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN inv.quantity ELSE 0 END), 0) AS near_expiry_units_total
       FROM inventory inv
       JOIN batches b ON b.id = inv.batch_id
       ${whereSql}`,
      params,
    );

    const r = rows[0] || {};
    return {
      expiredBatchesCount: Number(r.expired_batches_count || 0),
      expiredUnitsTotal: Number(r.expired_units_total || 0),
      nearExpiry30Count: Number(r.near_expiry_30_count || 0),
      nearExpiry60Count: Number(r.near_expiry_60_count || 0),
      nearExpiry90Count: Number(r.near_expiry_90_count || 0),
      nearExpiryUnitsTotal: Number(r.near_expiry_units_total || 0),
    };
  }

  async listBatches(queryParams, userId) {
    const db = getPool();
    const scope = await this.#resolveScope(userId);
    const params = [];
    const whereClauses = ['inv.quantity > 0'];

    if (scope.organizationIds.length > 0) {
      whereClauses.push(`inv.organization_id IN (${scope.organizationIds.map(() => '?').join(',')})`);
      params.push(...scope.organizationIds);
    }
    if (scope.branchIds.length > 0) {
      whereClauses.push(`inv.branch_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds);
    }
    if (scope.warehouseIds.length > 0) {
      whereClauses.push(`inv.warehouse_id IN (${scope.warehouseIds.map(() => '?').join(',')})`);
      params.push(...scope.warehouseIds);
    }

    if (queryParams.branchId) {
      whereClauses.push('inv.branch_id = ?');
      params.push(Number(queryParams.branchId));
    }
    if (queryParams.warehouseId) {
      whereClauses.push('inv.warehouse_id = ?');
      params.push(Number(queryParams.warehouseId));
    }
    if (queryParams.productId) {
      whereClauses.push('inv.product_id = ?');
      params.push(Number(queryParams.productId));
    }

    const thresholdDays = Number(queryParams.thresholdDays) || 90;

    if (queryParams.status === 'expired') {
      whereClauses.push('b.expiry_date <= CURDATE()');
    } else if (queryParams.status === 'near_expiry') {
      whereClauses.push('b.expiry_date > CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)');
      params.push(thresholdDays);
    } else {
      // Default: show both expired and near-expiry within threshold
      whereClauses.push('b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)');
      params.push(thresholdDays);
    }

    if (queryParams.search?.trim()) {
      const term = `%${queryParams.search.trim()}%`;
      whereClauses.push('(b.batch_number LIKE ? OR p.name LIKE ? OR p.code LIKE ?)');
      params.push(term, term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Count distinct batch & location positions
    const [countRows] = await db.query(
      `SELECT COUNT(DISTINCT CONCAT(inv.warehouse_id, '-', inv.batch_id)) AS total
       FROM inventory inv
       JOIN batches b ON b.id = inv.batch_id
       JOIN products p ON p.id = inv.product_id
       ${whereSql}`,
      params,
    );

    const total = countRows[0]?.total || 0;
    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Number(queryParams.limit) || 20;
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT
         b.id AS batch_id,
         b.batch_number,
         b.expiry_date,
         b.status AS batch_status,
         DATEDIFF(b.expiry_date, CURDATE()) AS days_to_expiry,
         p.id AS product_id,
         p.name AS product_name,
         p.code AS product_code,
         u.name AS unit_name,
         u.id AS unit_id,
         br.id AS branch_id,
         br.name AS branch_name,
         wh.id AS warehouse_id,
         wh.name AS warehouse_name,
         sl.id AS storage_location_id,
         sl.name AS storage_location_name,
         inv.organization_id,
         COALESCE(SUM(inv.quantity), 0) AS total_physical_quantity,
         COALESCE(SUM(CASE WHEN inv.status = 'available' THEN inv.quantity ELSE 0 END), 0) AS available_quantity,
         COALESCE(SUM(CASE WHEN inv.status = 'quarantined' THEN inv.quantity ELSE 0 END), 0) AS quarantined_quantity,
         COALESCE(SUM(CASE WHEN inv.status = 'expired' THEN inv.quantity ELSE 0 END), 0) AS expired_quantity,
         COALESCE(SUM(CASE WHEN inv.status = 'recalled' THEN inv.quantity ELSE 0 END), 0) AS recalled_quantity,
         COALESCE(SUM(CASE WHEN inv.status = 'reserved' THEN inv.quantity ELSE 0 END), 0) AS reserved_quantity
       FROM inventory inv
       JOIN batches b ON b.id = inv.batch_id
       JOIN products p ON p.id = inv.product_id
       JOIN units u ON u.id = inv.unit_id
       JOIN branches br ON br.id = inv.branch_id
       JOIN warehouses wh ON wh.id = inv.warehouse_id
       JOIN storage_locations sl ON sl.id = inv.storage_location_id
       ${whereSql}
       GROUP BY inv.warehouse_id, inv.storage_location_id, inv.batch_id, inv.unit_id
       ORDER BY b.expiry_date ASC, b.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const items = rows.map((r) => ({
      ...r,
      days_to_expiry: Number(r.days_to_expiry),
      is_expired: Number(r.days_to_expiry) <= 0,
      total_physical_quantity: Number(r.total_physical_quantity),
      available_quantity: Number(r.available_quantity),
      quarantined_quantity: Number(r.quarantined_quantity),
      expired_quantity: Number(r.expired_quantity),
      recalled_quantity: Number(r.recalled_quantity),
      reserved_quantity: Number(r.reserved_quantity),
    }));

    return { items, total, page, limit };
  }

  async segregateExpiredStock({ branchId, warehouseId, batchId, storageLocationId }, userId) {
    const db = getPool();
    const [batchRows] = await db.query(
      'SELECT id, batch_number, expiry_date, product_id, organization_id FROM batches WHERE id = ?',
      [batchId],
    );
    const batch = batchRows[0];
    if (!batch) {
      throw new AppError('Batch not found.', { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (new Date(batch.expiry_date).getTime() > Date.now()) {
      throw new AppError(`Batch ${batch.batch_number} is not expired (expiry date: ${batch.expiry_date}).`, {
        statusCode: 409,
        code: 'BATCH_NOT_EXPIRED',
      });
    }

    // Find available stock for this batch in the location
    const [invRows] = await db.query(
      `SELECT id, unit_id, quantity, storage_location_id
       FROM inventory
       WHERE organization_id = ? AND branch_id = ? AND warehouse_id = ?
         AND batch_id = ? AND status = 'available' AND quantity > 0
         ${storageLocationId ? 'AND storage_location_id = ?' : ''}`,
      storageLocationId
        ? [batch.organization_id, branchId, warehouseId, batchId, storageLocationId]
        : [batch.organization_id, branchId, warehouseId, batchId],
    );

    if (invRows.length === 0) {
      return { message: 'No available stock to segregate for this batch.', segregatedCount: 0 };
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      let totalSegregated = 0;
      for (const row of invRows) {
        const qty = Number(row.quantity);
        await inventoryService.transferInventoryStatus({
          organizationId: batch.organization_id,
          branchId,
          warehouseId,
          storageLocationId: row.storage_location_id,
          productId: batch.product_id,
          batchId,
          unitId: row.unit_id,
          fromStatus: 'available',
          toStatus: 'expired',
          quantity: qty,
          userId,
          reason: `Automatic expiry segregation for batch ${batch.batch_number}`,
          referenceType: 'expiry',
          referenceId: null,
          connection,
        });
        totalSegregated += qty;
      }

      await connection.commit();
      return { success: true, segregatedQuantity: totalSegregated };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

export default new ExpiryService();
