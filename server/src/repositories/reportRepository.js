/**
 * Task 21 — Reports and Dashboards Repository
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 *
 * All queries are strictly READ-ONLY aggregations on authoritative transactional tables.
 * Parameterized queries are used exclusively to guarantee SQL injection safety.
 */
import { getPool } from '../database/pool.js';

class ReportRepository {
  getPool() {
    return getPool();
  }

  /**
   * Helper to build branch SQL filter clause
   */
  _buildBranchClause(branchIds, tableAlias = '') {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    if (!branchIds || branchIds.length === 0) return { clause: '', params: [] };
    if (branchIds.length === 1) {
      return { clause: ` AND ${prefix}branch_id = ?`, params: [branchIds[0]] };
    }
    const placeholders = branchIds.map(() => '?').join(', ');
    return { clause: ` AND ${prefix}branch_id IN (${placeholders})`, params: branchIds };
  }

  /**
   * 1. Dashboard Overview Summary
   */
  async getDashboardSummary({ organizationId, branchIds, warehouseId, startDate, endDate }) {
    const pool = this.getPool();

    // 1.1 Completed Sales Metrics
    let salesSql = `
      SELECT
        COUNT(*) AS completed_sales_count,
        COALESCE(SUM(total_amount), 0) AS total_sales_amount,
        COALESCE(SUM(subtotal), 0) AS gross_sales_amount,
        COALESCE(SUM(discount_amount), 0) AS total_discount_amount,
        COALESCE(SUM(paid_amount), 0) AS total_paid_amount
      FROM sales
      WHERE organization_id = ?
        AND status = 'completed'
        AND sale_date >= ? AND sale_date <= ?
    `;
    const salesParams = [organizationId, startDate, endDate];
    const branchFilter = this._buildBranchClause(branchIds);
    salesSql += branchFilter.clause;
    salesParams.push(...branchFilter.params);

    if (warehouseId) {
      salesSql += ' AND warehouse_id = ?';
      salesParams.push(warehouseId);
    }
    const [[salesRow]] = await pool.query(salesSql, salesParams);

    // 1.2 Payment Collections
    let paySql = `
      SELECT
        COUNT(*) AS payment_count,
        COALESCE(SUM(amount), 0) AS total_collected
      FROM payments
      WHERE organization_id = ?
        AND status = 'completed'
        AND payment_date >= ? AND payment_date <= ?
    `;
    const payParams = [organizationId, startDate, endDate];
    paySql += branchFilter.clause;
    payParams.push(...branchFilter.params);
    const [[payRow]] = await pool.query(paySql, payParams);

    // 1.3 Outstanding Customer Receivables
    let recSql = `
      SELECT
        COUNT(*) AS active_receivables_count,
        COALESCE(SUM(balance_amount), 0) AS total_outstanding_balance,
        COALESCE(SUM(total_amount), 0) AS total_credit_extended
      FROM customer_receivables
      WHERE organization_id = ?
        AND status IN ('unpaid', 'partially_paid')
    `;
    const recParams = [organizationId];
    recSql += branchFilter.clause;
    recParams.push(...branchFilter.params);
    const [[recRow]] = await pool.query(recSql, recParams);

    // 1.4 Refunds
    let refSql = `
      SELECT
        COUNT(*) AS refund_count,
        COALESCE(SUM(amount), 0) AS total_refunded
      FROM refunds
      WHERE organization_id = ?
        AND status = 'completed'
        AND created_at >= ? AND created_at <= ?
    `;
    const refParams = [organizationId, startDate, endDate];
    refSql += branchFilter.clause;
    refParams.push(...branchFilter.params);
    const [[refRow]] = await pool.query(refSql, refParams);

    // 1.5 Inventory Quantities by Status
    let invSql = `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'available' THEN quantity ELSE 0 END), 0) AS available_qty,
        COALESCE(SUM(CASE WHEN status = 'reserved' THEN quantity ELSE 0 END), 0) AS reserved_qty,
        COALESCE(SUM(CASE WHEN status = 'quarantined' THEN quantity ELSE 0 END), 0) AS quarantined_qty,
        COALESCE(SUM(CASE WHEN status = 'expired' THEN quantity ELSE 0 END), 0) AS expired_qty,
        COALESCE(SUM(CASE WHEN status != 'disposed' THEN quantity ELSE 0 END), 0) AS physical_qty
      FROM inventory
      WHERE organization_id = ?
    `;
    const invParams = [organizationId];
    invSql += branchFilter.clause;
    invParams.push(...branchFilter.params);
    if (warehouseId) {
      invSql += ' AND warehouse_id = ?';
      invParams.push(warehouseId);
    }
    const [[invRow]] = await pool.query(invSql, invParams);

    // 1.6 Low Stock & Stockout Counts
    let stockLevelSql = `
      SELECT
        COUNT(CASE WHEN avail.total_available <= p.min_stock_level AND avail.total_available > 0 THEN 1 END) AS low_stock_count,
        COUNT(CASE WHEN COALESCE(avail.total_available, 0) = 0 THEN 1 END) AS stockout_count
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_available
        FROM inventory
        WHERE organization_id = ? AND status = 'available'
    `;
    const stockLevelParams = [organizationId];
    if (branchIds && branchIds.length > 0) {
      const bClause = this._buildBranchClause(branchIds);
      stockLevelSql += bClause.clause;
      stockLevelParams.push(...bClause.params);
    }
    if (warehouseId) {
      stockLevelSql += ' AND warehouse_id = ?';
      stockLevelParams.push(warehouseId);
    }
    stockLevelSql += `
        GROUP BY product_id
      ) avail ON p.id = avail.product_id
      WHERE p.organization_id = ? AND p.status = 'active' AND p.min_stock_level > 0
    `;
    stockLevelParams.push(organizationId);
    const [[stockLevelRow]] = await pool.query(stockLevelSql, stockLevelParams);

    // 1.7 Expiry Alert Counts
    let expirySql = `
      SELECT
        COUNT(DISTINCT CASE WHEN b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN b.id END) AS near_expiry_count,
        COUNT(DISTINCT CASE WHEN b.expiry_date < CURDATE() THEN b.id END) AS expired_batch_count
      FROM batches b
      JOIN inventory i ON b.id = i.batch_id
      WHERE b.organization_id = ? AND i.quantity > 0 AND i.status IN ('available', 'reserved', 'quarantined', 'expired')
    `;
    const expiryParams = [organizationId];
    expirySql += this._buildBranchClause(branchIds, 'i').clause;
    expiryParams.push(...this._buildBranchClause(branchIds, 'i').params);
    if (warehouseId) {
      expirySql += ' AND i.warehouse_id = ?';
      expiryParams.push(warehouseId);
    }
    const [[expiryRow]] = await pool.query(expirySql, expiryParams);

    // 1.8 Workflow Pipeline Counts (Approvals, Transfers, Prescriptions, Quarantines, Recalls)
    let appSql = `
      SELECT COUNT(*) AS pending_approvals_count
      FROM approval_requests
      WHERE organization_id = ? AND status = 'pending'
    `;
    const appParams = [organizationId];
    if (branchIds && branchIds.length > 0) {
      appSql += this._buildBranchClause(branchIds).clause;
      appParams.push(...this._buildBranchClause(branchIds).params);
    }
    const [[appRow]] = await pool.query(appSql, appParams);

    let trSql = `
      SELECT COUNT(*) AS in_transit_transfers_count
      FROM stock_transfers
      WHERE organization_id = ? AND status IN ('in_transit', 'partially_received')
    `;
    const trParams = [organizationId];
    if (branchIds && branchIds.length > 0) {
      trSql += ` AND (source_branch_id IN (${branchIds.map(() => '?').join(',')}) OR destination_branch_id IN (${branchIds.map(() => '?').join(',')}))`;
      trParams.push(...branchIds, ...branchIds);
    }
    const [[trRow]] = await pool.query(trSql, trParams);

    let rxSql = `
      SELECT COUNT(*) AS pending_prescriptions_count
      FROM prescriptions
      WHERE organization_id = ? AND status IN ('pending', 'validated', 'partially_dispensed')
    `;
    const rxParams = [organizationId];
    rxSql += branchFilter.clause;
    rxParams.push(...branchFilter.params);
    const [[rxRow]] = await pool.query(rxSql, rxParams);

    let quSql = `
      SELECT COUNT(*) AS active_quarantines_count
      FROM quarantine_cases
      WHERE organization_id = ? AND status IN ('quarantined', 'under_review')
    `;
    const quParams = [organizationId];
    quSql += branchFilter.clause;
    quParams.push(...branchFilter.params);
    const [[quRow]] = await pool.query(quSql, quParams);

    let rcSql = `
      SELECT COUNT(*) AS active_recalls_count
      FROM recall_cases
      WHERE organization_id = ? AND status IN ('active', 'monitoring')
    `;
    const [[rcRow]] = await pool.query(rcSql, [organizationId]);

    // 1.9 Recent Completed Sales (Top 5)
    let recentSalesSql = `
      SELECT
        s.id, s.sale_number, s.sale_date, s.total_amount, s.paid_amount, s.payment_status,
        b.name AS branch_name,
        c.name AS customer_name
      FROM sales s
      JOIN branches b ON s.branch_id = b.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.organization_id = ? AND s.status = 'completed'
    `;
    const recentSalesParams = [organizationId];
    recentSalesSql += this._buildBranchClause(branchIds, 's').clause;
    recentSalesParams.push(...this._buildBranchClause(branchIds, 's').params);
    recentSalesSql += ' ORDER BY s.sale_date DESC, s.id DESC LIMIT 5';
    const [recentSales] = await pool.query(recentSalesSql, recentSalesParams);

    // 1.10 Batches Expiring Soon (Top 5 within 90 days)
    let nearExpiryBatchesSql = `
      SELECT
        b.batch_number, b.expiry_date,
        DATEDIFF(b.expiry_date, CURDATE()) AS days_remaining,
        p.name AS product_name, p.code AS product_code,
        SUM(i.quantity) AS available_quantity,
        w.name AS warehouse_name
      FROM batches b
      JOIN products p ON b.product_id = p.id
      JOIN inventory i ON b.id = i.batch_id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE b.organization_id = ?
        AND b.expiry_date >= CURDATE()
        AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
        AND i.quantity > 0
        AND i.status = 'available'
    `;
    const nearExpiryParams = [organizationId];
    nearExpiryBatchesSql += this._buildBranchClause(branchIds, 'i').clause;
    nearExpiryParams.push(...this._buildBranchClause(branchIds, 'i').params);
    nearExpiryBatchesSql += `
      GROUP BY b.id, i.warehouse_id
      ORDER BY b.expiry_date ASC
      LIMIT 5
    `;
    const [nearExpiryBatches] = await pool.query(nearExpiryBatchesSql, nearExpiryParams);

    // 1.11 Top Selling Medicines
    const [topMedicines] = await pool.query(`
      SELECT 
        p.name, 
        COALESCE(c.name, 'General Medication') AS category,
        COALESCE(SUM(si.quantity), 0) AS units_sold,
        COALESCE(SUM(si.line_total), 0) AS total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.organization_id = ? AND s.status = 'completed'
      GROUP BY p.id, p.name, c.name
      ORDER BY total_revenue DESC
      LIMIT 5
    `, [organizationId]).catch(() => [[]]);

    // 1.12 Monthly Sales Distribution
    const [monthlySalesRows] = await pool.query(`
      SELECT 
        DATE_FORMAT(sale_date, '%b') AS month_name,
        MONTH(sale_date) as month_num,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM sales
      WHERE organization_id = ? AND status = 'completed'
      GROUP BY month_name, month_num
      ORDER BY month_num ASC
    `, [organizationId]).catch(() => [[]]);

    // 1.13 Active Customers Count
    const [[custRow]] = await pool.query(`
      SELECT COUNT(*) AS total_customers
      FROM customers
      WHERE organization_id = ? AND status = 'active'
    `, [organizationId]).catch(() => [[{ total_customers: 0 }]]);

    // 1.14 Procurement Purchases Total
    const [[poRow]] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_purchased
      FROM purchase_orders
      WHERE organization_id = ? AND status IN ('completed', 'approved', 'received')
    `, [organizationId]).catch(() => [[{ total_purchased: 0 }]]);

    const completedSalesCount = Number(salesRow?.completed_sales_count || 0);
    const totalSalesAmount = Number(salesRow?.total_sales_amount || 0);
    const averageSaleValue = completedSalesCount > 0
      ? Number((totalSalesAmount / completedSalesCount).toFixed(2))
      : 0;

    return {
      sales: {
        completedCount: completedSalesCount,
        totalSalesAmount,
        grossSalesAmount: Number(salesRow?.gross_sales_amount || 0),
        totalDiscountAmount: Number(salesRow?.total_discount_amount || 0),
        totalPaidAmount: Number(salesRow?.total_paid_amount || 0),
        averageSaleValue,
      },
      procurement: {
        totalPurchased: Number(poRow?.total_purchased || 0),
      },
      customers: {
        totalCustomers: Number(custRow?.total_customers || 0),
      },
      finance: {
        paymentCount: Number(payRow?.payment_count || 0),
        totalCollected: Number(payRow?.total_collected || 0),
        activeReceivablesCount: Number(recRow?.active_receivables_count || 0),
        totalOutstandingReceivables: Number(recRow?.total_outstanding_balance || 0),
        totalCreditExtended: Number(recRow?.total_credit_extended || 0),
        refundCount: Number(refRow?.refund_count || 0),
        totalRefunded: Number(refRow?.total_refunded || 0),
        netCollected: Number((Number(payRow?.total_collected || 0) - Number(refRow?.total_refunded || 0)).toFixed(2)),
      },
      inventory: {
        availableQuantity: Number(invRow?.available_qty || 0),
        reservedQuantity: Number(invRow?.reserved_qty || 0),
        quarantinedQuantity: Number(invRow?.quarantined_qty || 0),
        expiredQuantity: Number(invRow?.expired_qty || 0),
        physicalQuantity: Number(invRow?.physical_qty || 0),
        lowStockCount: Number(stockLevelRow?.low_stock_count || 0),
        stockoutCount: Number(stockLevelRow?.stockout_count || 0),
        nearExpiryBatchCount: Number(expiryRow?.near_expiry_count || 0),
        expiredBatchCount: Number(expiryRow?.expired_batch_count || 0),
      },
      operations: {
        pendingApprovalsCount: Number(appRow?.pending_approvals_count || 0),
        inTransitTransfersCount: Number(trRow?.in_transit_transfers_count || 0),
        pendingPrescriptionsCount: Number(rxRow?.pending_prescriptions_count || 0),
        activeQuarantinesCount: Number(quRow?.active_quarantines_count || 0),
        activeRecallsCount: Number(rcRow?.active_recalls_count || 0),
      },
      recentSales,
      nearExpiryBatches,
      topMedicines: (topMedicines || []).map((tm) => ({
        name: tm.name,
        category: tm.category,
        unitsSold: Number(tm.units_sold || 0),
        totalRevenue: Number(tm.total_revenue || 0),
      })),
      monthlySales: (monthlySalesRows || []).map((ms) => ({
        month: ms.month_name,
        monthNum: ms.month_num,
        total: Number(ms.total_amount || 0),
      })),
    };
  }

  /**
   * 2. Detailed Sales Report
   */
  async getSalesReport({
    organizationId,
    branchIds,
    startDate,
    endDate,
    productId,
    categoryId,
    paymentStatus,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // Summary totals (excluding drafts/cancelled/voided)
    let sumSql = `
      SELECT
        COUNT(DISTINCT s.id) AS count,
        COALESCE(SUM(s.subtotal), 0) AS gross_total,
        COALESCE(SUM(s.discount_amount), 0) AS total_discount,
        COALESCE(SUM(s.total_amount), 0) AS net_total,
        COALESCE(SUM(s.paid_amount), 0) AS paid_total
      FROM sales s
    `;
    const sumParams = [];
    if (productId || categoryId) {
      sumSql += ' JOIN sale_lines sl ON s.id = sl.sale_id JOIN products p ON sl.product_id = p.id';
    }
    sumSql += ' WHERE s.organization_id = ? AND s.status = \'completed\'';
    sumParams.push(organizationId);

    if (startDate) {
      sumSql += ' AND s.sale_date >= ?';
      sumParams.push(startDate);
    }
    if (endDate) {
      sumSql += ' AND s.sale_date <= ?';
      sumParams.push(endDate);
    }
    const bClause = this._buildBranchClause(branchIds, 's');
    sumSql += bClause.clause;
    sumParams.push(...bClause.params);

    if (paymentStatus) {
      sumSql += ' AND s.payment_status = ?';
      sumParams.push(paymentStatus);
    }
    if (productId) {
      sumSql += ' AND sl.product_id = ?';
      sumParams.push(productId);
    }
    if (categoryId) {
      sumSql += ' AND p.category_id = ?';
      sumParams.push(categoryId);
    }

    const [[summary]] = await pool.query(sumSql, sumParams);

    // Daily trend
    let dailySql = `
      SELECT
        DATE(s.sale_date) AS date,
        COUNT(DISTINCT s.id) AS sales_count,
        COALESCE(SUM(s.total_amount), 0) AS total_amount,
        COALESCE(SUM(s.paid_amount), 0) AS paid_amount
      FROM sales s
      WHERE s.organization_id = ? AND s.status = 'completed'
    `;
    const dailyParams = [organizationId];
    if (startDate) {
      dailySql += ' AND s.sale_date >= ?';
      dailyParams.push(startDate);
    }
    if (endDate) {
      dailySql += ' AND s.sale_date <= ?';
      dailyParams.push(endDate);
    }
    dailySql += bClause.clause;
    dailyParams.push(...bClause.params);
    dailySql += ' GROUP BY DATE(s.sale_date) ORDER BY date ASC';
    const [dailyTrend] = await pool.query(dailySql, dailyParams);

    // Sales by branch breakdown
    let branchBreakdownSql = `
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        COUNT(s.id) AS sales_count,
        COALESCE(SUM(s.total_amount), 0) AS total_amount
      FROM sales s
      JOIN branches b ON s.branch_id = b.id
      WHERE s.organization_id = ? AND s.status = 'completed'
    `;
    const branchParams = [organizationId];
    if (startDate) {
      branchBreakdownSql += ' AND s.sale_date >= ?';
      branchParams.push(startDate);
    }
    if (endDate) {
      branchBreakdownSql += ' AND s.sale_date <= ?';
      branchParams.push(endDate);
    }
    branchBreakdownSql += bClause.clause;
    branchParams.push(...bClause.params);
    branchBreakdownSql += ' GROUP BY b.id, b.name ORDER BY total_amount DESC';
    const [byBranch] = await pool.query(branchBreakdownSql, branchParams);

    // Top products sold
    let topProductsSql = `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.code AS product_code,
        COALESCE(c.name, 'Uncategorized') AS category_name,
        SUM(sl.quantity) AS total_quantity,
        SUM(sl.line_total) AS total_revenue
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      JOIN products p ON sl.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.organization_id = ? AND s.status = 'completed'
    `;
    const topProdParams = [organizationId];
    if (startDate) {
      topProductsSql += ' AND s.sale_date >= ?';
      topProdParams.push(startDate);
    }
    if (endDate) {
      topProductsSql += ' AND s.sale_date <= ?';
      topProdParams.push(endDate);
    }
    topProductsSql += this._buildBranchClause(branchIds, 's').clause;
    topProdParams.push(...this._buildBranchClause(branchIds, 's').params);
    topProductsSql += ' GROUP BY p.id, p.name, p.code, c.name ORDER BY total_revenue DESC LIMIT 10';
    const [topProducts] = await pool.query(topProductsSql, topProdParams);

    // Paginated sales transactions
    let listSql = `
      SELECT
        s.id,
        s.sale_number,
        s.sale_date,
        s.status,
        s.payment_status,
        s.subtotal,
        s.discount_amount,
        s.total_amount,
        s.paid_amount,
        b.name AS branch_name,
        c.name AS customer_name,
        COUNT(sl.id) AS item_count
      FROM sales s
      JOIN branches b ON s.branch_id = b.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sale_lines sl ON s.id = sl.sale_id
      WHERE s.organization_id = ? AND s.status = 'completed'
    `;
    const listParams = [organizationId];
    if (startDate) {
      listSql += ' AND s.sale_date >= ?';
      listParams.push(startDate);
    }
    if (endDate) {
      listSql += ' AND s.sale_date <= ?';
      listParams.push(endDate);
    }
    listSql += this._buildBranchClause(branchIds, 's').clause;
    listParams.push(...this._buildBranchClause(branchIds, 's').params);
    if (paymentStatus) {
      listSql += ' AND s.payment_status = ?';
      listParams.push(paymentStatus);
    }

    listSql += ' GROUP BY s.id ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    listParams.push(limit, offset);
    const [rows] = await pool.query(listSql, listParams);

    return {
      summary: {
        completedCount: Number(summary?.count || 0),
        grossTotal: Number(summary?.gross_total || 0),
        totalDiscount: Number(summary?.total_discount || 0),
        netTotal: Number(summary?.net_total || 0),
        paidTotal: Number(summary?.paid_total || 0),
      },
      dailyTrend,
      byBranch,
      topProducts,
      pagination: {
        page,
        limit,
        total: Number(summary?.count || 0),
        totalPages: Math.ceil(Number(summary?.count || 0) / limit),
      },
      items: rows,
    };
  }

  /**
   * 3. Inventory Stock and Valuation Report
   */
  async getInventoryReport({
    organizationId,
    branchIds,
    warehouseId,
    categoryId,
    status,
    isLowStock,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // Summary counts
    let sumSql = `
      SELECT
        COALESCE(SUM(CASE WHEN i.status = 'available' THEN i.quantity ELSE 0 END), 0) AS total_available,
        COALESCE(SUM(CASE WHEN i.status = 'reserved' THEN i.quantity ELSE 0 END), 0) AS total_reserved,
        COALESCE(SUM(CASE WHEN i.status = 'quarantined' THEN i.quantity ELSE 0 END), 0) AS total_quarantined,
        COALESCE(SUM(CASE WHEN i.status = 'expired' THEN i.quantity ELSE 0 END), 0) AS total_expired,
        COALESCE(SUM(CASE WHEN i.status != 'disposed' THEN i.quantity ELSE 0 END), 0) AS total_physical
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.organization_id = ?
    `;
    const sumParams = [organizationId];
    sumSql += this._buildBranchClause(branchIds, 'i').clause;
    sumParams.push(...this._buildBranchClause(branchIds, 'i').params);
    if (warehouseId) {
      sumSql += ' AND i.warehouse_id = ?';
      sumParams.push(warehouseId);
    }
    if (categoryId) {
      sumSql += ' AND p.category_id = ?';
      sumParams.push(categoryId);
    }
    if (status) {
      sumSql += ' AND i.status = ?';
      sumParams.push(status);
    }
    const [[summary]] = await pool.query(sumSql, sumParams);

    // Stock by category
    let catSql = `
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category_name,
        COUNT(DISTINCT p.id) AS product_count,
        SUM(CASE WHEN i.status = 'available' THEN i.quantity ELSE 0 END) AS available_quantity
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE i.organization_id = ?
    `;
    const catParams = [organizationId];
    catSql += this._buildBranchClause(branchIds, 'i').clause;
    catParams.push(...this._buildBranchClause(branchIds, 'i').params);
    if (warehouseId) {
      catSql += ' AND i.warehouse_id = ?';
      catParams.push(warehouseId);
    }
    catSql += ' GROUP BY c.id, c.name ORDER BY available_quantity DESC';
    const [byCategory] = await pool.query(catSql, catParams);

    // Stock by warehouse
    let whSql = `
      SELECT
        w.id AS warehouse_id,
        w.name AS warehouse_name,
        SUM(CASE WHEN i.status = 'available' THEN i.quantity ELSE 0 END) AS available_quantity,
        SUM(CASE WHEN i.status != 'disposed' THEN i.quantity ELSE 0 END) AS physical_quantity
      FROM inventory i
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.organization_id = ?
    `;
    const whParams = [organizationId];
    whSql += this._buildBranchClause(branchIds, 'i').clause;
    whParams.push(...this._buildBranchClause(branchIds, 'i').params);
    whSql += ' GROUP BY w.id, w.name ORDER BY available_quantity DESC';
    const [byWarehouse] = await pool.query(whSql, whParams);

    // Paginated Inventory positions list with valuation basis (latest PO unit price)
    let listSql = `
      SELECT
        i.id,
        i.quantity,
        i.status AS inventory_status,
        p.id AS product_id,
        p.code AS product_code,
        p.name AS product_name,
        p.min_stock_level,
        p.reorder_level,
        COALESCE(c.name, 'Uncategorized') AS category_name,
        u.name AS unit_name,
        w.name AS warehouse_name,
        sl.name AS location_name,
        b.batch_number,
        b.expiry_date,
        (
          SELECT pol.unit_price
          FROM purchase_order_lines pol
          JOIN purchase_orders po ON pol.purchase_order_id = po.id
          WHERE pol.product_id = p.id AND po.status = 'fully_received'
          ORDER BY po.order_date DESC, pol.id DESC
          LIMIT 1
        ) AS latest_unit_cost
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN units u ON i.unit_id = u.id
      JOIN warehouses w ON i.warehouse_id = w.id
      JOIN storage_locations sl ON i.storage_location_id = sl.id
      JOIN batches b ON i.batch_id = b.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE i.organization_id = ?
    `;
    const listParams = [organizationId];
    listSql += this._buildBranchClause(branchIds, 'i').clause;
    listParams.push(...this._buildBranchClause(branchIds, 'i').params);
    if (warehouseId) {
      listSql += ' AND i.warehouse_id = ?';
      listParams.push(warehouseId);
    }
    if (categoryId) {
      listSql += ' AND p.category_id = ?';
      listParams.push(categoryId);
    }
    if (status) {
      listSql += ' AND i.status = ?';
      listParams.push(status);
    }
    if (isLowStock === 'true' || isLowStock === true) {
      listSql += ' AND i.quantity <= p.min_stock_level AND p.min_stock_level > 0';
    }

    // Count for pagination
    const countSql = `SELECT COUNT(*) AS total FROM (${listSql}) AS subquery`;
    const [[countRow]] = await pool.query(countSql, listParams);
    const total = Number(countRow?.total || 0);

    listSql += ' ORDER BY p.name ASC, b.expiry_date ASC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    listParams.push(limit, offset);
    const [rows] = await pool.query(listSql, listParams);

    // Compute estimated valuation on available stock using latest_unit_cost where present
    const rowsWithValuation = rows.map((r) => {
      const unitCost = r.latest_unit_cost ? Number(r.latest_unit_cost) : null;
      const val = unitCost !== null ? Number((r.quantity * unitCost).toFixed(2)) : null;
      return {
        ...r,
        estimated_unit_cost: unitCost,
        estimated_stock_value: val,
      };
    });

    return {
      summary: {
        availableQuantity: Number(summary?.total_available || 0),
        reservedQuantity: Number(summary?.total_reserved || 0),
        quarantinedQuantity: Number(summary?.total_quarantined || 0),
        expiredQuantity: Number(summary?.total_expired || 0),
        physicalQuantity: Number(summary?.total_physical || 0),
      },
      byCategory,
      byWarehouse,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      items: rowsWithValuation,
    };
  }

  /**
   * 4. Financial & Receivables Report
   */
  async getFinancialReport({
    organizationId,
    branchIds,
    startDate,
    endDate,
    paymentMethod,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // Summary collections & refunds
    let paySumSql = `
      SELECT
        COUNT(*) AS payment_count,
        COALESCE(SUM(amount), 0) AS total_collected
      FROM payments
      WHERE organization_id = ? AND status = 'completed'
    `;
    const paySumParams = [organizationId];
    if (startDate) {
      paySumSql += ' AND payment_date >= ?';
      paySumParams.push(startDate);
    }
    if (endDate) {
      paySumSql += ' AND payment_date <= ?';
      paySumParams.push(endDate);
    }
    paySumSql += this._buildBranchClause(branchIds).clause;
    paySumParams.push(...this._buildBranchClause(branchIds).params);
    if (paymentMethod) {
      paySumSql += ' AND payment_method = ?';
      paySumParams.push(paymentMethod);
    }
    const [[paySum]] = await pool.query(paySumSql, paySumParams);

    let refSumSql = `
      SELECT
        COUNT(*) AS refund_count,
        COALESCE(SUM(amount), 0) AS total_refunded
      FROM refunds
      WHERE organization_id = ? AND status = 'completed'
    `;
    const refSumParams = [organizationId];
    if (startDate) {
      refSumSql += ' AND created_at >= ?';
      refSumParams.push(startDate);
    }
    if (endDate) {
      refSumSql += ' AND created_at <= ?';
      refSumParams.push(endDate);
    }
    refSumSql += this._buildBranchClause(branchIds).clause;
    refSumParams.push(...this._buildBranchClause(branchIds).params);
    const [[refSum]] = await pool.query(refSumSql, refSumParams);

    // Receivables summary
    let recSumSql = `
      SELECT
        COUNT(CASE WHEN status IN ('unpaid', 'partially_paid') THEN 1 END) AS active_count,
        COALESCE(SUM(CASE WHEN status IN ('unpaid', 'partially_paid') THEN balance_amount ELSE 0 END), 0) AS outstanding_balance,
        COALESCE(SUM(total_amount), 0) AS total_credit_issued,
        COALESCE(SUM(paid_amount), 0) AS total_credit_collected
      FROM customer_receivables
      WHERE organization_id = ? AND status != 'cancelled'
    `;
    const recSumParams = [organizationId];
    recSumSql += this._buildBranchClause(branchIds).clause;
    recSumParams.push(...this._buildBranchClause(branchIds).params);
    const [[recSum]] = await pool.query(recSumSql, recSumParams);

    // Collections by method
    let methodSql = `
      SELECT
        payment_method,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM payments
      WHERE organization_id = ? AND status = 'completed'
    `;
    const methodParams = [organizationId];
    if (startDate) {
      methodSql += ' AND payment_date >= ?';
      methodParams.push(startDate);
    }
    if (endDate) {
      methodSql += ' AND payment_date <= ?';
      methodParams.push(endDate);
    }
    methodSql += this._buildBranchClause(branchIds).clause;
    methodParams.push(...this._buildBranchClause(branchIds).params);
    methodSql += ' GROUP BY payment_method ORDER BY total_amount DESC';
    const [byMethod] = await pool.query(methodSql, methodParams);

    // Collections by branch
    let branchSql = `
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        COUNT(p.id) AS count,
        COALESCE(SUM(p.amount), 0) AS total_amount
      FROM payments p
      JOIN branches b ON p.branch_id = b.id
      WHERE p.organization_id = ? AND p.status = 'completed'
    `;
    const branchParams = [organizationId];
    if (startDate) {
      branchSql += ' AND p.payment_date >= ?';
      branchParams.push(startDate);
    }
    if (endDate) {
      branchSql += ' AND p.payment_date <= ?';
      branchParams.push(endDate);
    }
    branchSql += this._buildBranchClause(branchIds, 'p').clause;
    branchParams.push(...this._buildBranchClause(branchIds, 'p').params);
    branchSql += ' GROUP BY b.id, b.name ORDER BY total_amount DESC';
    const [byBranch] = await pool.query(branchSql, branchParams);

    // Paginated customer receivables list
    let recListSql = `
      SELECT
        cr.id,
        cr.receivable_number,
        cr.reference_type,
        cr.reference_id,
        cr.total_amount,
        cr.paid_amount,
        cr.balance_amount,
        cr.due_date,
        cr.status,
        c.name AS customer_name,
        b.name AS branch_name
      FROM customer_receivables cr
      JOIN customers c ON cr.customer_id = c.id
      JOIN branches b ON cr.branch_id = b.id
      WHERE cr.organization_id = ? AND cr.status != 'cancelled'
    `;
    const recListParams = [organizationId];
    recListSql += this._buildBranchClause(branchIds, 'cr').clause;
    recListParams.push(...this._buildBranchClause(branchIds, 'cr').params);

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM (${recListSql}) AS sub`, recListParams);
    const total = Number(countRow?.total || 0);

    recListSql += ' ORDER BY cr.due_date ASC, cr.id DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    recListParams.push(limit, offset);
    const [receivables] = await pool.query(recListSql, recListParams);

    return {
      summary: {
        paymentCount: Number(paySum?.payment_count || 0),
        totalCollected: Number(paySum?.total_collected || 0),
        refundCount: Number(refSum?.refund_count || 0),
        totalRefunded: Number(refSum?.total_refunded || 0),
        netCollections: Number((Number(paySum?.total_collected || 0) - Number(refSum?.total_refunded || 0)).toFixed(2)),
        activeReceivablesCount: Number(recSum?.active_count || 0),
        outstandingReceivablesBalance: Number(recSum?.outstanding_balance || 0),
        totalCreditIssued: Number(recSum?.total_credit_issued || 0),
        totalCreditCollected: Number(recSum?.total_credit_collected || 0),
      },
      byMethod,
      byBranch,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      receivables,
    };
  }

  /**
   * 5. Procurement & Receiving Report
   */
  async getProcurementReport({
    organizationId,
    branchIds,
    supplierId,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // Summary PO stats
    let poSumSql = `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_spend,
        COUNT(CASE WHEN status = 'fully_received' THEN 1 END) AS fully_received_count,
        COUNT(CASE WHEN status = 'partially_received' THEN 1 END) AS partially_received_count,
        COUNT(CASE WHEN status IN ('submitted', 'pending_approval', 'approved') THEN 1 END) AS pending_count
      FROM purchase_orders
      WHERE organization_id = ? AND status != 'cancelled'
    `;
    const poSumParams = [organizationId];
    if (startDate) {
      poSumSql += ' AND order_date >= ?';
      poSumParams.push(startDate);
    }
    if (endDate) {
      poSumSql += ' AND order_date <= ?';
      poSumParams.push(endDate);
    }
    poSumSql += this._buildBranchClause(branchIds).clause;
    poSumParams.push(...this._buildBranchClause(branchIds).params);
    if (supplierId) {
      poSumSql += ' AND supplier_id = ?';
      poSumParams.push(supplierId);
    }
    if (status) {
      poSumSql += ' AND status = ?';
      poSumParams.push(status);
    }
    const [[poSum]] = await pool.query(poSumSql, poSumParams);

    // Goods Receipts count
    let grSumSql = `
      SELECT
        COUNT(*) AS total_receipts,
        COUNT(CASE WHEN status = 'discrepancy' THEN 1 END) AS discrepancy_receipts_count
      FROM goods_receipts
      WHERE organization_id = ? AND status != 'cancelled'
    `;
    const grSumParams = [organizationId];
    if (startDate) {
      grSumSql += ' AND receipt_date >= ?';
      grSumParams.push(startDate);
    }
    if (endDate) {
      grSumSql += ' AND receipt_date <= ?';
      grSumParams.push(endDate);
    }
    grSumSql += this._buildBranchClause(branchIds).clause;
    grSumParams.push(...this._buildBranchClause(branchIds).params);
    const [[grSum]] = await pool.query(grSumSql, grSumParams);

    // Spend by supplier
    let supSql = `
      SELECT
        s.id AS supplier_id,
        s.name AS supplier_name,
        COUNT(po.id) AS order_count,
        COALESCE(SUM(po.total_amount), 0) AS total_spend
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.organization_id = ? AND po.status != 'cancelled'
    `;
    const supParams = [organizationId];
    if (startDate) {
      supSql += ' AND po.order_date >= ?';
      supParams.push(startDate);
    }
    if (endDate) {
      supSql += ' AND po.order_date <= ?';
      supParams.push(endDate);
    }
    supSql += this._buildBranchClause(branchIds, 'po').clause;
    supParams.push(...this._buildBranchClause(branchIds, 'po').params);
    supSql += ' GROUP BY s.id, s.name ORDER BY total_spend DESC LIMIT 10';
    const [bySupplier] = await pool.query(supSql, supParams);

    // Paginated PO fulfillment list (Ordered vs Received)
    let listSql = `
      SELECT
        po.id,
        po.po_number,
        po.order_date,
        po.expected_delivery_date,
        po.status,
        po.total_amount,
        s.name AS supplier_name,
        b.name AS branch_name,
        COALESCE(SUM(pol.ordered_quantity), 0) AS total_ordered_qty,
        COALESCE((
          SELECT SUM(grl.received_quantity)
          FROM goods_receipt_lines grl
          JOIN goods_receipts gr ON grl.goods_receipt_id = gr.id
          WHERE gr.purchase_order_id = po.id AND gr.status != 'cancelled'
        ), 0) AS total_received_qty
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      JOIN branches b ON po.branch_id = b.id
      LEFT JOIN purchase_order_lines pol ON po.id = pol.purchase_order_id
      WHERE po.organization_id = ? AND po.status != 'cancelled'
    `;
    const listParams = [organizationId];
    if (startDate) {
      listSql += ' AND po.order_date >= ?';
      listParams.push(startDate);
    }
    if (endDate) {
      listSql += ' AND po.order_date <= ?';
      listParams.push(endDate);
    }
    listSql += this._buildBranchClause(branchIds, 'po').clause;
    listParams.push(...this._buildBranchClause(branchIds, 'po').params);
    if (supplierId) {
      listSql += ' AND po.supplier_id = ?';
      listParams.push(supplierId);
    }
    if (status) {
      listSql += ' AND po.status = ?';
      listParams.push(status);
    }

    listSql += ' GROUP BY po.id';

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM (${listSql}) AS sub`, listParams);
    const total = Number(countRow?.total || 0);

    listSql += ' ORDER BY po.order_date DESC, po.id DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    listParams.push(limit, offset);
    const [rows] = await pool.query(listSql, listParams);

    const items = rows.map((r) => {
      const ordered = Number(r.total_ordered_qty || 0);
      const received = Number(r.total_received_qty || 0);
      const fulfillmentRate = ordered > 0 ? Number(((received / ordered) * 100).toFixed(1)) : 0;
      return {
        ...r,
        total_ordered_qty: ordered,
        total_received_qty: received,
        fulfillment_rate_percent: fulfillmentRate,
      };
    });

    return {
      summary: {
        totalOrders: Number(poSum?.total_orders || 0),
        totalSpend: Number(poSum?.total_spend || 0),
        fullyReceivedCount: Number(poSum?.fully_received_count || 0),
        partiallyReceivedCount: Number(poSum?.partially_received_count || 0),
        pendingOrdersCount: Number(poSum?.pending_count || 0),
        totalReceipts: Number(grSum?.total_receipts || 0),
        discrepancyReceiptsCount: Number(grSum?.discrepancy_receipts_count || 0),
      },
      bySupplier,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      items,
    };
  }

  /**
   * 6. Clinical & Dispensing Operational Report
   */
  async getDispensingReport({
    organizationId,
    branchIds,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // Prescription statuses breakdown
    let rxSql = `
      SELECT
        status,
        COUNT(*) AS count
      FROM prescriptions
      WHERE organization_id = ?
    `;
    const rxParams = [organizationId];
    if (startDate) {
      rxSql += ' AND prescription_date >= ?';
      rxParams.push(startDate);
    }
    if (endDate) {
      rxSql += ' AND prescription_date <= ?';
      rxParams.push(endDate);
    }
    rxSql += this._buildBranchClause(branchIds).clause;
    rxParams.push(...this._buildBranchClause(branchIds).params);
    rxSql += ' GROUP BY status';
    const [prescriptionsByStatus] = await pool.query(rxSql, rxParams);

    // Dispensing statuses breakdown & revenue
    let dispSql = `
      SELECT
        status,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(paid_amount), 0) AS paid_amount
      FROM dispensings
      WHERE organization_id = ?
    `;
    const dispParams = [organizationId];
    if (startDate) {
      dispSql += ' AND dispensing_date >= ?';
      dispParams.push(startDate);
    }
    if (endDate) {
      dispSql += ' AND dispensing_date <= ?';
      dispParams.push(endDate);
    }
    dispSql += this._buildBranchClause(branchIds).clause;
    dispParams.push(...this._buildBranchClause(branchIds).params);
    dispSql += ' GROUP BY status';
    const [dispensingsByStatus] = await pool.query(dispSql, dispParams);

    // Top dispensed products
    let topProdSql = `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.code AS product_code,
        SUM(dl.dispensed_quantity) AS total_quantity,
        COUNT(DISTINCT d.id) AS dispensing_count
      FROM dispensing_lines dl
      JOIN dispensings d ON dl.dispensing_id = d.id
      JOIN products p ON dl.product_id = p.id
      WHERE d.organization_id = ? AND d.status = 'completed'
    `;
    const topProdParams = [organizationId];
    if (startDate) {
      topProdSql += ' AND d.dispensing_date >= ?';
      topProdParams.push(startDate);
    }
    if (endDate) {
      topProdSql += ' AND d.dispensing_date <= ?';
      topProdParams.push(endDate);
    }
    topProdSql += this._buildBranchClause(branchIds, 'd').clause;
    topProdParams.push(...this._buildBranchClause(branchIds, 'd').params);
    topProdSql += ' GROUP BY p.id, p.name, p.code ORDER BY total_quantity DESC LIMIT 10';
    const [topProducts] = await pool.query(topProdSql, topProdParams);

    // Paginated dispensings list
    let listSql = `
      SELECT
        d.id,
        d.dispensing_number,
        d.dispensing_date,
        d.status,
        d.total_amount,
        d.paid_amount,
        d.payment_status,
        b.name AS branch_name,
        rx.prescription_number,
        pt.name AS patient_name
      FROM dispensings d
      JOIN branches b ON d.branch_id = b.id
      LEFT JOIN prescriptions rx ON d.prescription_id = rx.id
      LEFT JOIN patients pt ON d.patient_id = pt.id
      WHERE d.organization_id = ?
    `;
    const listParams = [organizationId];
    if (startDate) {
      listSql += ' AND d.dispensing_date >= ?';
      listParams.push(startDate);
    }
    if (endDate) {
      listSql += ' AND d.dispensing_date <= ?';
      listParams.push(endDate);
    }
    listSql += this._buildBranchClause(branchIds, 'd').clause;
    listParams.push(...this._buildBranchClause(branchIds, 'd').params);

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM (${listSql}) AS sub`, listParams);
    const total = Number(countRow?.total || 0);

    listSql += ' ORDER BY d.dispensing_date DESC, d.id DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    listParams.push(limit, offset);
    const [rows] = await pool.query(listSql, listParams);

    return {
      prescriptionsByStatus,
      dispensingsByStatus,
      topProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      items: rows,
    };
  }

  /**
   * 7. Expiry, Quarantine, and Recall Exceptions Report
   */
  async getExpiryQuarantineReport({
    organizationId,
    branchIds,
    warehouseId,
    daysThreshold = 90,
    page = 1,
    limit = 20,
  }) {
    const pool = this.getPool();

    // 7.1 Expiry summary & Near-Expiry/Expired list
    let expSql = `
      SELECT
        b.id AS batch_id,
        b.batch_number,
        b.expiry_date,
        DATEDIFF(b.expiry_date, CURDATE()) AS days_remaining,
        p.code AS product_code,
        p.name AS product_name,
        w.name AS warehouse_name,
        bch.name AS branch_name,
        u.name AS unit_name,
        SUM(i.quantity) AS total_quantity,
        i.status AS inventory_status
      FROM batches b
      JOIN inventory i ON b.id = i.batch_id
      JOIN products p ON b.product_id = p.id
      JOIN units u ON i.unit_id = u.id
      JOIN warehouses w ON i.warehouse_id = w.id
      JOIN branches bch ON i.branch_id = bch.id
      WHERE b.organization_id = ?
        AND i.quantity > 0
        AND (b.expiry_date < CURDATE() OR b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY))
    `;
    const expParams = [organizationId, daysThreshold];
    expSql += this._buildBranchClause(branchIds, 'i').clause;
    expParams.push(...this._buildBranchClause(branchIds, 'i').params);
    if (warehouseId) {
      expSql += ' AND i.warehouse_id = ?';
      expParams.push(warehouseId);
    }
    expSql += ' GROUP BY b.id, i.warehouse_id, i.status';

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM (${expSql}) AS sub`, expParams);
    const totalExp = Number(countRow?.total || 0);

    expSql += ' ORDER BY b.expiry_date ASC, p.name ASC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    expParams.push(limit, offset);
    const [expiryBatches] = await pool.query(expSql, expParams);

    // 7.2 Active Quarantines List
    let quSql = `
      SELECT
        q.id,
        q.quarantine_number,
        q.reason,
        q.status,
        q.quantity,
        q.source_type,
        q.created_at,
        p.name AS product_name,
        p.code AS product_code,
        b.batch_number,
        bch.name AS branch_name,
        w.name AS warehouse_name
      FROM quarantine_cases q
      JOIN products p ON q.product_id = p.id
      JOIN batches b ON q.batch_id = b.id
      JOIN branches bch ON q.branch_id = bch.id
      JOIN warehouses w ON q.warehouse_id = w.id
      WHERE q.organization_id = ? AND q.status IN ('quarantined', 'under_review')
    `;
    const quParams = [organizationId];
    quSql += this._buildBranchClause(branchIds, 'q').clause;
    quParams.push(...this._buildBranchClause(branchIds, 'q').params);
    if (warehouseId) {
      quSql += ' AND q.warehouse_id = ?';
      quParams.push(warehouseId);
    }
    quSql += ' ORDER BY q.created_at DESC LIMIT 20';
    const [quarantines] = await pool.query(quSql, quParams);

    // 7.3 Active Recalls List
    const [recalls] = await pool.query(
      `
      SELECT
        rc.id,
        rc.recall_number,
        rc.title,
        rc.severity,
        rc.status,
        rc.effective_date,
        p.name AS product_name,
        p.code AS product_code
      FROM recall_cases rc
      JOIN products p ON rc.product_id = p.id
      WHERE rc.organization_id = ? AND rc.status IN ('active', 'monitoring', 'under_review')
      ORDER BY rc.effective_date DESC
      LIMIT 20
    `,
      [organizationId],
    );

    return {
      pagination: {
        page,
        limit,
        total: totalExp,
        totalPages: Math.ceil(totalExp / limit),
      },
      expiryBatches,
      quarantines,
      recalls,
    };
  }
}

export default new ReportRepository();
