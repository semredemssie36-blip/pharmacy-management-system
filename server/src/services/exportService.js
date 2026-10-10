import AppError from '../errors/AppError.js';
import authorizationService from './authorizationService.js';
import auditService from './auditService.js';
import reportService from './reportService.js';
import { getPool } from '../database/pool.js';
import { serializeCsv } from '../utils/csvUtils.js';

class ExportService {
  /**
   * Generates a sanitized CSV export for the requested dataset.
   * 
   * @param {object} params
   * @param {object} params.user
   * @param {string} params.type
   * @param {object} params.filters
   * @returns {Promise<{ filename: string, csv: string }>}
   */
  async exportData({ user, type, filters = {} }) {
    // 1. Permission checks
    const permissions = await authorizationService.getUserPermissions(user.id);
    const scope = await authorizationService.getUserScope(user.id);
    const permSet = new Set(permissions);
    const roles = await authorizationService.getUserRoles(user.id);
    const isSystemAdmin = roles.some((r) => r.code === 'SYSTEM_ADMINISTRATOR');

    if (!permSet.has('data.export.execute') && !isSystemAdmin) {
      throw new AppError('You do not have permission to export data.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    const checkPerm = (code) => {
      if (!permSet.has(code) && !isSystemAdmin) {
        throw new AppError(`Missing permission ${code} required to export ${type}.`, {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    };

    const orgIds = new Set(scope.organizationIds);
    if (scope.branchIds && scope.branchIds.size > 0) {
      const branchArr = [...scope.branchIds];
      const [bRows] = await getPool().query(
        `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
        branchArr,
      );
      bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }
    const organizationId = [...orgIds][0] || null;
    if (!organizationId) {
      throw new AppError('User has no organization context', { statusCode: 400, code: 'NO_ORG' });
    }

    const branchIds = scope.isSystemAdmin ? [] : Array.from(scope.branchIds || []);
    const pool = getPool();
    const timestamp = new Date().toISOString().slice(0, 10);
    let filename = `export_${type}_${timestamp}.csv`;
    let columns = [];
    let records = [];

    switch (type) {
      case 'products': {
        checkPerm('product.view');
        const sql = `
          SELECT 
            p.code,
            p.name,
            p.barcode,
            c.name AS category,
            b.name AS brand,
            g.name AS generic,
            df.name AS dosage_form,
            p.prescription_classification,
            p.controlled_classification,
            p.antibiotic_classification,
            p.storage_requirement,
            p.min_stock_level,
            p.max_stock_level,
            p.reorder_level,
            p.status
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN generics g ON g.id = p.generic_id
          LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
          WHERE p.organization_id = ?
          ORDER BY p.name ASC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, [organizationId]);
        columns = [
          { key: 'code', label: 'Product Code' },
          { key: 'name', label: 'Product Name' },
          { key: 'barcode', label: 'Barcode' },
          { key: 'category', label: 'Category' },
          { key: 'brand', label: 'Brand' },
          { key: 'generic', label: 'Generic Name' },
          { key: 'dosage_form', label: 'Dosage Form' },
          { key: 'prescription_classification', label: 'Rx Classification' },
          { key: 'controlled_classification', label: 'Controlled' },
          { key: 'antibiotic_classification', label: 'Antibiotic' },
          { key: 'storage_requirement', label: 'Storage' },
          { key: 'min_stock_level', label: 'Min Stock' },
          { key: 'max_stock_level', label: 'Max Stock' },
          { key: 'reorder_level', label: 'Reorder Level' },
          { key: 'status', label: 'Status' },
        ];
        records = rows;
        break;
      }

      case 'suppliers': {
        checkPerm('supplier.view');
        const sql = `
          SELECT 
            code,
            name,
            contact_person,
            telephone,
            email,
            address,
            country,
            tax_registration_number,
            status
          FROM suppliers
          WHERE organization_id = ?
          ORDER BY name ASC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, [organizationId]);
        columns = [
          { key: 'code', label: 'Supplier Code' },
          { key: 'name', label: 'Supplier Name' },
          { key: 'contact_person', label: 'Contact Person' },
          { key: 'telephone', label: 'Telephone' },
          { key: 'email', label: 'Email' },
          { key: 'address', label: 'Address' },
          { key: 'country', label: 'Country' },
          { key: 'tax_registration_number', label: 'Tax Reg Number (TIN)' },
          { key: 'status', label: 'Status' },
        ];
        records = rows;
        break;
      }

      case 'customers': {
        checkPerm('customer.view');
        const sql = `
          SELECT 
            code,
            name,
            customer_type,
            telephone,
            email,
            address,
            territory,
            pricing_tier,
            credit_limit,
            payment_terms,
            status
          FROM customers
          WHERE organization_id = ?
          ORDER BY name ASC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, [organizationId]);
        columns = [
          { key: 'code', label: 'Customer Code' },
          { key: 'name', label: 'Customer Name' },
          { key: 'customer_type', label: 'Type' },
          { key: 'telephone', label: 'Telephone' },
          { key: 'email', label: 'Email' },
          { key: 'address', label: 'Address' },
          { key: 'territory', label: 'Territory' },
          { key: 'pricing_tier', label: 'Pricing Tier' },
          { key: 'credit_limit', label: 'Credit Limit' },
          { key: 'payment_terms', label: 'Payment Terms' },
          { key: 'status', label: 'Status' },
        ];
        records = rows;
        break;
      }

      case 'inventory': {
        checkPerm('inventory.view');
        const params = [organizationId];
        let branchFilter = '';
        if (branchIds.length > 0) {
          branchFilter = `AND w.branch_id IN (${branchIds.map(() => '?').join(',')})`;
          params.push(...branchIds);
        }

        const sql = `
          SELECT 
            p.code AS product_code,
            p.name AS product_name,
            b.batch_number,
            b.expiry_date,
            w.name AS warehouse_name,
            sl.name AS location_name,
            i.status,
            i.quantity
          FROM inventory i
          JOIN products p ON p.id = i.product_id
          JOIN batches b ON b.id = i.batch_id
          JOIN warehouses w ON w.id = i.warehouse_id
          LEFT JOIN storage_locations sl ON sl.id = i.storage_location_id
          WHERE p.organization_id = ?
            ${branchFilter}
          ORDER BY p.name ASC, b.expiry_date ASC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, params);
        columns = [
          { key: 'product_code', label: 'Product Code' },
          { key: 'product_name', label: 'Product Name' },
          { key: 'batch_number', label: 'Batch Number' },
          { key: 'expiry_date', label: 'Expiry Date' },
          { key: 'warehouse_name', label: 'Warehouse' },
          { key: 'location_name', label: 'Location' },
          { key: 'status', label: 'Status' },
          { key: 'quantity', label: 'Quantity' },
        ];
        records = rows;
        break;
      }

      case 'sales': {
        checkPerm('sale.view');
        const params = [organizationId];
        let branchFilter = '';
        if (branchIds.length > 0) {
          branchFilter = `AND s.branch_id IN (${branchIds.map(() => '?').join(',')})`;
          params.push(...branchIds);
        }

        const sql = `
          SELECT 
            s.sale_number,
            br.name AS branch_name,
            c.name AS customer_name,
            DATE_FORMAT(s.sale_date, '%Y-%m-%d %H:%i') AS sale_date,
            s.status,
            s.subtotal,
            s.discount_amount,
            s.total_amount
          FROM sales s
          LEFT JOIN branches br ON br.id = s.branch_id
          LEFT JOIN customers c ON c.id = s.customer_id
          WHERE s.organization_id = ?
            ${branchFilter}
          ORDER BY s.sale_date DESC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, params);
        columns = [
          { key: 'sale_number', label: 'Sale Number' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'sale_date', label: 'Sale Date' },
          { key: 'status', label: 'Status' },
          { key: 'subtotal', label: 'Subtotal' },
          { key: 'discount_amount', label: 'Discount' },
          { key: 'total_amount', label: 'Total Amount' },
        ];
        records = rows;
        break;
      }

      case 'purchase_orders': {
        checkPerm('purchase_order.view');
        const params = [organizationId];
        let branchFilter = '';
        if (branchIds.length > 0) {
          branchFilter = `AND po.branch_id IN (${branchIds.map(() => '?').join(',')})`;
          params.push(...branchIds);
        }

        const sql = `
          SELECT 
            po.po_number,
            br.name AS branch_name,
            sup.name AS supplier_name,
            DATE_FORMAT(po.order_date, '%Y-%m-%d') AS order_date,
            DATE_FORMAT(po.expected_delivery_date, '%Y-%m-%d') AS expected_delivery_date,
            po.status,
            po.total_amount
          FROM purchase_orders po
          LEFT JOIN branches br ON br.id = po.branch_id
          LEFT JOIN suppliers sup ON sup.id = po.supplier_id
          WHERE po.organization_id = ?
            ${branchFilter}
          ORDER BY po.order_date DESC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, params);
        columns = [
          { key: 'po_number', label: 'PO Number' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'supplier_name', label: 'Supplier' },
          { key: 'order_date', label: 'Order Date' },
          { key: 'expected_delivery_date', label: 'Expected Delivery' },
          { key: 'status', label: 'Status' },
          { key: 'total_amount', label: 'Total Amount' },
        ];
        records = rows;
        break;
      }

      case 'goods_receipts': {
        checkPerm('goods_receipt.view');
        const params = [organizationId];
        let branchFilter = '';
        if (branchIds.length > 0) {
          branchFilter = `AND gr.branch_id IN (${branchIds.map(() => '?').join(',')})`;
          params.push(...branchIds);
        }

        const sql = `
          SELECT 
            gr.receipt_number,
            po.po_number,
            sup.name AS supplier_name,
            br.name AS branch_name,
            gr.supplier_delivery_note,
            DATE_FORMAT(gr.receipt_date, '%Y-%m-%d') AS receipt_date,
            gr.status
          FROM goods_receipts gr
          LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
          LEFT JOIN suppliers sup ON sup.id = gr.supplier_id
          LEFT JOIN branches br ON br.id = gr.branch_id
          WHERE gr.organization_id = ?
            ${branchFilter}
          ORDER BY gr.receipt_date DESC
          LIMIT 10000
        `;
        const [rows] = await pool.query(sql, params);
        columns = [
          { key: 'receipt_number', label: 'Receipt No' },
          { key: 'po_number', label: 'PO Number' },
          { key: 'supplier_name', label: 'Supplier' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'supplier_delivery_note', label: 'Delivery Note' },
          { key: 'receipt_date', label: 'Receipt Date' },
          { key: 'status', label: 'Status' },
        ];
        records = rows;
        break;
      }

      // Reused Task 21 Reports exports
      case 'reports_sales': {
        checkPerm('report.sales.view');
        const report = await reportService.getSalesReport(
          {
            startDate: filters.startDate,
            endDate: filters.endDate,
            branchId: filters.branchId,
            page: 1,
            limit: 10000,
          },
          user
        );
        columns = [
          { key: 'sale_date', label: 'Sale Date' },
          { key: 'sale_number', label: 'Receipt No' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'subtotal', label: 'Subtotal' },
          { key: 'discount_amount', label: 'Discount' },
          { key: 'total_amount', label: 'Total Amount' },
          { key: 'paid_amount', label: 'Paid Amount' },
          { key: 'payment_status', label: 'Payment Status' },
        ];
        records = report.items || [];
        filename = `report_sales_${timestamp}.csv`;
        break;
      }

      case 'reports_inventory': {
        checkPerm('report.inventory.view');
        const report = await reportService.getInventoryReport(
          {
            warehouseId: filters.warehouseId,
            status: filters.status,
            page: 1,
            limit: 10000,
          },
          user
        );
        columns = [
          { key: 'product_code', label: 'Product Code' },
          { key: 'product_name', label: 'Product Name' },
          { key: 'category_name', label: 'Category' },
          { key: 'warehouse_name', label: 'Warehouse' },
          { key: 'inventory_status', label: 'Status' },
          { key: 'quantity', label: 'Quantity' },
          { key: 'batch_number', label: 'Batch No' },
          { key: 'expiry_date', label: 'Expiry Date' },
          { key: 'estimated_unit_cost', label: 'Unit Cost Basis' },
          { key: 'estimated_stock_value', label: 'Valuation' },
        ];
        records = report.items || [];
        filename = `report_inventory_${timestamp}.csv`;
        break;
      }

      case 'reports_financial': {
        checkPerm('report.financial.view');
        const report = await reportService.getFinancialReport(
          {
            startDate: filters.startDate,
            endDate: filters.endDate,
            page: 1,
            limit: 10000,
          },
          user
        );
        columns = [
          { key: 'receivable_number', label: 'Receivable No' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'branch_name', label: 'Branch' },
          { key: 'total_amount', label: 'Total Invoiced' },
          { key: 'paid_amount', label: 'Paid Amount' },
          { key: 'balance_amount', label: 'Outstanding Balance' },
          { key: 'due_date', label: 'Due Date' },
          { key: 'status', label: 'Status' },
        ];
        records = report.receivables || [];
        filename = `report_financial_${timestamp}.csv`;
        break;
      }

      default:
        throw new AppError(`Unsupported export type: ${type}`, {
          statusCode: 400,
          code: 'UNSUPPORTED_EXPORT_TYPE',
        });
    }

    const csv = serializeCsv(columns, records);

    // Audit export action
    await auditService.log({
      organizationId,
      actorUserId: user.id,
      action: 'data_export.executed',
      resourceType: 'export',
      resourceReference: filename,
      reason: `Exported ${records.length} records for ${type}`,
      details: { type, rowCount: records.length, filters },
    }).catch(() => {});

    return {
      filename,
      csv,
    };
  }
}

export default new ExportService();
