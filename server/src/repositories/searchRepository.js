import { getPool } from '../database/pool.js';

/**
 * Executes secure, parameterized searches across authorized modules.
 */
class SearchRepository {
  /**
   * Searches products in the user's organization.
   */
  async searchProducts({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        p.id,
        p.code,
        p.name,
        p.barcode,
        p.status,
        b.name AS brand_name,
        g.name AS generic_name,
        c.name AS category_name
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN generics g ON g.id = p.generic_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.organization_id = ?
        AND (
          p.name LIKE ?
          OR p.code LIKE ?
          OR p.barcode LIKE ?
          OR p.registration_number LIKE ?
          OR g.name LIKE ?
          OR b.name LIKE ?
        )
      ORDER BY p.name ASC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [
      organizationId,
      pattern, pattern, pattern, pattern, pattern, pattern,
      limit,
    ]);

    return rows.map((r) => ({
      id: r.id,
      category: 'products',
      title: r.name,
      subtitle: `Code: ${r.code}${r.generic_name ? ` • Generic: ${r.generic_name}` : ''}`,
      badge: r.status,
      route: `/master-data/products/${r.id}`,
      metadata: {
        code: r.code,
        barcode: r.barcode,
        category: r.category_name,
      },
    }));
  }

  /**
   * Searches inventory batches.
   */
  async searchBatches({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        b.id,
        b.batch_number,
        b.expiry_date,
        b.status,
        p.id AS product_id,
        p.name AS product_name,
        p.code AS product_code
      FROM batches b
      JOIN products p ON p.id = b.product_id
      WHERE b.organization_id = ?
        AND (
          b.batch_number LIKE ?
          OR p.name LIKE ?
          OR p.code LIKE ?
        )
      ORDER BY b.expiry_date ASC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [organizationId, pattern, pattern, pattern, limit]);

    return rows.map((r) => ({
      id: r.id,
      category: 'batches',
      title: `Batch: ${r.batch_number}`,
      subtitle: `${r.product_name} (${r.product_code}) • Exp: ${r.expiry_date ? String(r.expiry_date).slice(0, 10) : 'N/A'}`,
      badge: r.status,
      route: '/inventory/batches',
      metadata: {
        batchNumber: r.batch_number,
        expiryDate: r.expiry_date,
        productId: r.product_id,
      },
    }));
  }

  /**
   * Searches suppliers.
   */
  async searchSuppliers({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        s.id,
        s.code,
        s.name,
        s.contact_person,
        s.telephone,
        s.email,
        s.status
      FROM suppliers s
      WHERE s.organization_id = ?
        AND (
          s.name LIKE ?
          OR s.code LIKE ?
          OR s.telephone LIKE ?
          OR s.email LIKE ?
        )
      ORDER BY s.name ASC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [organizationId, pattern, pattern, pattern, pattern, limit]);

    return rows.map((r) => ({
      id: r.id,
      category: 'suppliers',
      title: r.name,
      subtitle: `${r.code ? `Code: ${r.code} • ` : ''}${r.telephone || r.email || ''}`,
      badge: r.status,
      route: '/partners/suppliers',
      metadata: { code: r.code, contactPerson: r.contact_person },
    }));
  }

  /**
   * Searches customers.
   */
  async searchCustomers({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        c.id,
        c.code,
        c.name,
        c.customer_type,
        c.telephone,
        c.email,
        c.status
      FROM customers c
      WHERE c.organization_id = ?
        AND (
          c.name LIKE ?
          OR c.code LIKE ?
          OR c.telephone LIKE ?
          OR c.email LIKE ?
        )
      ORDER BY c.name ASC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [organizationId, pattern, pattern, pattern, pattern, limit]);

    return rows.map((r) => ({
      id: r.id,
      category: 'customers',
      title: r.name,
      subtitle: `${r.customer_type} • ${r.telephone || r.email || ''}`,
      badge: r.status,
      route: '/partners/customers',
      metadata: { code: r.code, customerType: r.customer_type },
    }));
  }

  /**
   * Searches purchase orders.
   */
  async searchPurchaseOrders({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND po.branch_id IN (${branchIds.map(() => '?').join(',')})`;
      params.push(...branchIds);
    }
    params.push(pattern, pattern, limit);

    const sql = `
      SELECT 
        po.id,
        po.po_number,
        po.status,
        po.order_date,
        s.name AS supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.organization_id = ?
        ${branchFilter}
        AND (po.po_number LIKE ? OR s.name LIKE ?)
      ORDER BY po.order_date DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'purchase_orders',
      title: r.po_number,
      subtitle: `Supplier: ${r.supplier_name || 'N/A'} • ${String(r.order_date).slice(0, 10)}`,
      badge: r.status,
      route: `/procurement/purchase-orders/${r.id}`,
      metadata: { poNumber: r.po_number, status: r.status },
    }));
  }

  /**
   * Searches goods receipts.
   */
  async searchGoodsReceipts({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND gr.branch_id IN (${branchIds.map(() => '?').join(',')})`;
      params.push(...branchIds);
    }
    params.push(pattern, pattern, limit);

    const sql = `
      SELECT 
        gr.id,
        gr.receipt_number,
        gr.supplier_delivery_note,
        gr.status,
        gr.receipt_date
      FROM goods_receipts gr
      WHERE gr.organization_id = ?
        ${branchFilter}
        AND (gr.receipt_number LIKE ? OR gr.supplier_delivery_note LIKE ?)
      ORDER BY gr.receipt_date DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'goods_receipts',
      title: r.receipt_number,
      subtitle: `Note: ${r.supplier_delivery_note || 'N/A'} • ${String(r.receipt_date).slice(0, 10)}`,
      badge: r.status,
      route: `/procurement/goods-receipts/${r.id}`,
      metadata: { receiptNumber: r.receipt_number },
    }));
  }

  /**
   * Searches sales orders/receipts.
   */
  async searchSales({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND s.branch_id IN (${branchIds.map(() => '?').join(',')})`;
      params.push(...branchIds);
    }
    params.push(pattern, limit);

    const sql = `
      SELECT 
        s.id,
        s.sale_number,
        s.status,
        s.total_amount,
        s.sale_date,
        c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.organization_id = ?
        ${branchFilter}
        AND s.sale_number LIKE ?
      ORDER BY s.sale_date DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'sales',
      title: r.sale_number,
      subtitle: `Total: ${Number(r.total_amount || 0).toFixed(2)} • ${r.customer_name || 'Walk-in'}`,
      badge: r.status,
      route: '/sales',
      metadata: { saleNumber: r.sale_number },
    }));
  }

  /**
   * Searches stock transfers.
   */
  async searchStockTransfers({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND (st.source_branch_id IN (${branchIds.map(() => '?').join(',')}) OR st.destination_branch_id IN (${branchIds.map(() => '?').join(',')}))`;
      params.push(...branchIds, ...branchIds);
    }
    params.push(pattern, limit);

    const sql = `
      SELECT 
        st.id,
        st.transfer_number,
        st.status,
        st.transfer_date
      FROM stock_transfers st
      WHERE st.organization_id = ?
        ${branchFilter}
        AND st.transfer_number LIKE ?
      ORDER BY st.transfer_date DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'transfers',
      title: r.transfer_number,
      subtitle: `Date: ${String(r.transfer_date).slice(0, 10)}`,
      badge: r.status,
      route: `/inventory/transfers/${r.id}`,
      metadata: { transferNumber: r.transfer_number },
    }));
  }

  /**
   * Searches quarantine cases.
   */
  async searchQuarantines({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND qc.branch_id IN (${branchIds.map(() => '?').join(',')})`;
      params.push(...branchIds);
    }
    params.push(pattern, pattern, limit);

    const sql = `
      SELECT 
        qc.id,
        qc.case_number,
        qc.reason,
        qc.status
      FROM quarantine_cases qc
      WHERE qc.organization_id = ?
        ${branchFilter}
        AND (qc.case_number LIKE ? OR qc.reason LIKE ?)
      ORDER BY qc.created_at DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'quarantines',
      title: r.case_number,
      subtitle: `Reason: ${r.reason}`,
      badge: r.status,
      route: `/inventory/quarantines/${r.id}`,
      metadata: { caseNumber: r.case_number },
    }));
  }

  /**
   * Searches recall cases.
   */
  async searchRecalls({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        rc.id,
        rc.recall_number,
        rc.title,
        rc.severity,
        rc.status
      FROM recall_cases rc
      WHERE rc.organization_id = ?
        AND (rc.recall_number LIKE ? OR rc.title LIKE ?)
      ORDER BY rc.created_at DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [organizationId, pattern, pattern, limit]);

    return rows.map((r) => ({
      id: r.id,
      category: 'recalls',
      title: r.recall_number,
      subtitle: r.title,
      badge: `${r.severity} • ${r.status}`,
      route: `/inventory/recalls/${r.id}`,
      metadata: { recallNumber: r.recall_number, severity: r.severity },
    }));
  }

  /**
   * Searches prescriptions (gated by prescription.view).
   */
  async searchPrescriptions({ organizationId, branchIds, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const params = [organizationId];
    let branchFilter = '';
    if (branchIds && branchIds.length > 0) {
      branchFilter = `AND pr.branch_id IN (${branchIds.map(() => '?').join(',')})`;
      params.push(...branchIds);
    }
    params.push(pattern, limit);

    const sql = `
      SELECT 
        pr.id,
        pr.prescription_number,
        pr.status,
        pr.prescription_date
      FROM prescriptions pr
      WHERE pr.organization_id = ?
        ${branchFilter}
        AND pr.prescription_number LIKE ?
      ORDER BY pr.prescription_date DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, params);

    return rows.map((r) => ({
      id: r.id,
      category: 'prescriptions',
      title: r.prescription_number,
      subtitle: `Date: ${String(r.prescription_date).slice(0, 10)}`,
      badge: r.status,
      route: '/clinical/prescriptions',
      metadata: { prescriptionNumber: r.prescription_number },
    }));
  }

  /**
   * Searches patients (gated by patient.view).
   */
  async searchPatients({ organizationId, query, limit = 5 }) {
    const pool = getPool();
    const pattern = `%${query}%`;
    const sql = `
      SELECT 
        pt.id,
        pt.patient_number,
        CONCAT(pt.first_name, ' ', pt.last_name) AS name,
        pt.phone,
        pt.gender
      FROM patients pt
      WHERE pt.organization_id = ?
        AND (
          pt.patient_number LIKE ?
          OR pt.first_name LIKE ?
          OR pt.last_name LIKE ?
          OR pt.phone LIKE ?
        )
      ORDER BY pt.first_name ASC
      LIMIT ?
    `;
    const [rows] = await pool.query(sql, [organizationId, pattern, pattern, pattern, pattern, limit]);

    return rows.map((r) => ({
      id: r.id,
      category: 'patients',
      title: r.name,
      subtitle: `Patient No: ${r.patient_number} • Phone: ${r.phone || 'N/A'}`,
      badge: r.gender,
      route: `/clinical/patients/${r.id}`,
      metadata: { patientNumber: r.patient_number },
    }));
  }
}

export default new SearchRepository();
