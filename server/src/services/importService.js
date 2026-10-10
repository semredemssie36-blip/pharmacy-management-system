import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import auditService from './auditService.js';
import importRepository from '../repositories/importRepository.js';
import { getPool } from '../database/pool.js';
import { parseCsv } from '../utils/csvUtils.js';

const TEMPLATES = {
  products: {
    headers: [
      'code',
      'name',
      'barcode',
      'description',
      'category_code',
      'dosage_form_code',
      'prescription_classification',
      'controlled_classification',
      'antibiotic_classification',
      'storage_requirement',
      'min_stock_level',
      'max_stock_level',
      'reorder_level',
    ],
    sampleRow: [
      'MED-001',
      'Paracetamol 500mg Tablets',
      '600123456789',
      'Analgesic and antipyretic tablets',
      'ANALGESICS',
      'TAB',
      'otc',
      'none',
      'none',
      'normal',
      '10',
      '500',
      '50',
    ],
  },
  suppliers: {
    headers: [
      'code',
      'name',
      'contact_person',
      'telephone',
      'email',
      'address',
      'country',
      'tax_registration_number',
      'notes',
    ],
    sampleRow: [
      'SUP-001',
      'Ethio Pharma Import PLC',
      'Abebe Bikila',
      '+251911223344',
      'info@ethiopharma.com',
      'Bole Sub-City, Addis Ababa',
      'Ethiopia',
      'TIN1234567890',
      'Wholesale pharmaceutical distributor',
    ],
  },
  customers: {
    headers: [
      'code',
      'name',
      'customer_type',
      'telephone',
      'email',
      'address',
      'territory',
      'pricing_tier',
      'credit_limit',
      'payment_terms',
      'notes',
    ],
    sampleRow: [
      'CUST-001',
      'St. Paul Hospital Millennium Medical College',
      'institution',
      '+251922334455',
      'purchasing@stpaul.et',
      'Gulele Sub-City, Addis Ababa',
      'Addis Ababa',
      'institutional',
      '50000.00',
      'Net 30',
      'Monthly credit billing account',
    ],
  },
};

async function resolveOrganizationId(userId, requestedOrgId = null) {
  const scope = await authorizationService.getUserScope(userId);
  const orgIds = new Set(scope.organizationIds);
  if (scope.branchIds && scope.branchIds.size > 0) {
    const branchArr = [...scope.branchIds];
    const [bRows] = await getPool().query(
      `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
      branchArr,
    );
    bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
  }
  if (requestedOrgId && orgIds.has(Number(requestedOrgId))) {
    return Number(requestedOrgId);
  }
  return [...orgIds][0] || null;
}

class ImportService {
  /**
   * Generates a documented CSV template for download.
   */
  getTemplate(type) {
    const config = TEMPLATES[type];
    if (!config) {
      throw new AppError(`Unsupported import entity type: ${type}`, {
        statusCode: 400,
        code: 'UNSUPPORTED_IMPORT_TYPE',
      });
    }

    const headerLine = config.headers.join(',');
    const sampleLine = config.sampleRow
      .map((val) => (val.includes(',') ? `"${val}"` : val))
      .join(',');

    return `${headerLine}\r\n${sampleLine}\r\n`;
  }

  /**
   * Validates and returns a preview of the imported CSV.
   */
  async validateAndPreview({ user, type, csvString, updateExisting = false }) {
    const config = TEMPLATES[type];
    if (!config) {
      throw new AppError(`Unsupported import entity type: ${type}`, {
        statusCode: 400,
        code: 'UNSUPPORTED_IMPORT_TYPE',
      });
    }

    const organizationId = await resolveOrganizationId(user.id);
    if (!organizationId) {
      throw new AppError('User has no organization context', { statusCode: 400, code: 'NO_ORG' });
    }

    const { headers, rows } = parseCsv(csvString);
    if (rows.length === 0) {
      throw new AppError('Uploaded CSV file contains no data rows.', {
        statusCode: 400,
        code: 'EMPTY_CSV_FILE',
      });
    }

    // Verify required headers
    const missingHeaders = [];
    if (type === 'products') {
      ['code', 'name', 'prescription_classification'].forEach((h) => {
        if (!headers.includes(h)) missingHeaders.push(h);
      });
    } else if (type === 'suppliers' || type === 'customers') {
      ['name'].forEach((h) => {
        if (!headers.includes(h)) missingHeaders.push(h);
      });
    }

    if (missingHeaders.length > 0) {
      throw new AppError(`Missing required CSV headers: ${missingHeaders.join(', ')}`, {
        statusCode: 400,
        code: 'MISSING_CSV_HEADERS',
        details: missingHeaders,
      });
    }

    // Row-by-row validation
    const previewRows = [];
    const seenCodesInFile = new Set();
    const codesToLookup = [];

    rows.forEach((r) => {
      const code = (r.code || '').trim();
      if (code) codesToLookup.push(code);
    });

    let existingDbRecords = new Map();
    if (type === 'products') {
      existingDbRecords = await importRepository.getExistingProductCodes(organizationId, codesToLookup);
    } else if (type === 'suppliers') {
      existingDbRecords = await importRepository.getExistingSupplierCodes(organizationId, codesToLookup);
    } else if (type === 'customers') {
      existingDbRecords = await importRepository.getExistingCustomerCodes(organizationId, codesToLookup);
    }

    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // Line 1 is header
      const row = rows[i];
      const errors = [];
      let action = 'create';

      const code = (row.code || '').trim();
      const name = (row.name || '').trim();

      if (type === 'products') {
        if (!code) errors.push('Product code is required');
        if (!name) errors.push('Product name is required');

        const rxClass = (row.prescription_classification || '').toLowerCase().trim();
        if (!['prescription', 'otc'].includes(rxClass)) {
          errors.push("prescription_classification must be 'prescription' or 'otc'");
        }

        const controlled = (row.controlled_classification || 'none').toLowerCase().trim();
        if (controlled && !['none', 'controlled', 'restricted'].includes(controlled)) {
          errors.push("controlled_classification must be 'none', 'controlled', or 'restricted'");
        }

        const antibiotic = (row.antibiotic_classification || 'none').toLowerCase().trim();
        if (antibiotic && !['none', 'antibiotic'].includes(antibiotic)) {
          errors.push("antibiotic_classification must be 'none' or 'antibiotic'");
        }

        const storage = (row.storage_requirement || 'normal').toLowerCase().trim();
        if (storage && !['normal', 'refrigerated', 'controlled'].includes(storage)) {
          errors.push("storage_requirement must be 'normal', 'refrigerated', or 'controlled'");
        }

        // Numeric checks
        ['min_stock_level', 'max_stock_level', 'reorder_level'].forEach((field) => {
          if (row[field] !== undefined && row[field] !== '') {
            const val = Number(row[field]);
            if (Number.isNaN(val) || val < 0) {
              errors.push(`${field} must be a non-negative number`);
            }
          }
        });
      } else if (type === 'suppliers') {
        if (!name) errors.push('Supplier name is required');
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
          errors.push('Supplier email format is invalid');
        }
      } else if (type === 'customers') {
        if (!name) errors.push('Customer name is required');
        const cType = (row.customer_type || 'individual').toLowerCase().trim();
        if (!['individual', 'business', 'institution'].includes(cType)) {
          errors.push("customer_type must be 'individual', 'business', or 'institution'");
        }
        if (row.credit_limit !== undefined && row.credit_limit !== '') {
          const val = Number(row.credit_limit);
          if (Number.isNaN(val) || val < 0) {
            errors.push('credit_limit must be a non-negative number');
          }
        }
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
          errors.push('Customer email format is invalid');
        }
      }

      // Check in-file duplicate code
      if (code) {
        if (seenCodesInFile.has(code)) {
          errors.push(`Duplicate code in file: "${code}"`);
          duplicateRows++;
        } else {
          seenCodesInFile.add(code);
        }

        // Check database existence
        if (existingDbRecords.has(code)) {
          if (updateExisting) {
            action = 'update';
          } else {
            errors.push(`Code "${code}" already exists in the organization database`);
            duplicateRows++;
          }
        }
      }

      const isValid = errors.length === 0;
      if (isValid) {
        validRows++;
      } else {
        invalidRows++;
      }

      previewRows.push({
        rowNumber: rowNum,
        data: row,
        isValid,
        action,
        errors,
      });
    }

    return {
      type,
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      rows: previewRows,
    };
  }

  /**
   * Executes atomic commit of imported master data.
   */
  async commitImport({ user, type, csvString, filename, updateExisting = false }) {
    // 1. Permission checks
    const permissions = await authorizationService.getUserPermissions(user.id);
    const scope = await authorizationService.getUserScope(user.id);
    const permSet = new Set(permissions);
    const roles = await authorizationService.getUserRoles(user.id);
    const isSystemAdmin = roles.some((r) => r.code === 'SYSTEM_ADMINISTRATOR');

    if (!permSet.has('data.import.execute') && !isSystemAdmin) {
      throw new AppError('You do not have permission to execute data imports.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    if (type === 'products') {
      if (!permSet.has('product.create') && !isSystemAdmin) {
        throw new AppError('Missing product.create permission for importing products.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
      if (updateExisting && !permSet.has('product.update') && !isSystemAdmin) {
        throw new AppError('Missing product.update permission to update existing products during import.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    } else if (type === 'suppliers') {
      if (!permSet.has('supplier.create') && !isSystemAdmin) {
        throw new AppError('Missing supplier.create permission for importing suppliers.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
      if (updateExisting && !permSet.has('supplier.update') && !isSystemAdmin) {
        throw new AppError('Missing supplier.update permission to update existing suppliers.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    } else if (type === 'customers') {
      if (!permSet.has('customer.create') && !isSystemAdmin) {
        throw new AppError('Missing customer.create permission for importing customers.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
      if (updateExisting && !permSet.has('customer.update') && !isSystemAdmin) {
        throw new AppError('Missing customer.update permission to update existing customers.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      }
    }

    // 2. Perform complete preview & validation
    const preview = await this.validateAndPreview({ user, type, csvString, updateExisting });

    if (preview.invalidRows > 0) {
      const errorSample = preview.rows.filter((r) => !r.isValid).slice(0, 5);
      throw new ValidationError('CSV import validation failed. All rows must be valid for atomic import.', errorSample);
    }

    const organizationId = await resolveOrganizationId(user.id);

    // 3. Create initial tracking job
    const job = await importRepository.createJob({
      organizationId,
      userId: user.id,
      importType: type,
      filename: filename || `${type}_import.csv`,
      status: 'processing',
      totalRows: preview.totalRows,
    });

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let successfulRows = 0;

      for (const item of preview.rows) {
        const row = item.data;
        const code = (row.code || '').trim() || null;
        const name = (row.name || '').trim();

        if (type === 'products') {
          // Category and Dosage Form Lookups
          let categoryId = null;
          if (row.category_code?.trim()) {
            const cat = await importRepository.getCategoryByCode(organizationId, row.category_code.trim());
            if (cat) categoryId = cat.id;
          }

          let dosageFormId = null;
          if (row.dosage_form_code?.trim()) {
            const df = await importRepository.getDosageFormByCode(organizationId, row.dosage_form_code.trim());
            if (df) dosageFormId = df.id;
          }

          const rxClass = (row.prescription_classification || 'prescription').toLowerCase().trim();
          const controlled = (row.controlled_classification || 'none').toLowerCase().trim();
          const antibiotic = (row.antibiotic_classification || 'none').toLowerCase().trim();
          const storage = (row.storage_requirement || 'normal').toLowerCase().trim();

          const minStock = row.min_stock_level ? Number(row.min_stock_level) : null;
          const maxStock = row.max_stock_level ? Number(row.max_stock_level) : null;
          const reorder = row.reorder_level ? Number(row.reorder_level) : null;

          if (item.action === 'update') {
            await connection.query(
              `UPDATE products SET
                name = ?,
                barcode = ?,
                description = ?,
                category_id = COALESCE(?, category_id),
                dosage_form_id = COALESCE(?, dosage_form_id),
                prescription_classification = ?,
                controlled_classification = ?,
                antibiotic_classification = ?,
                storage_requirement = ?,
                min_stock_level = ?,
                max_stock_level = ?,
                reorder_level = ?
              WHERE organization_id = ? AND code = ?`,
              [
                name,
                row.barcode?.trim() || null,
                row.description?.trim() || null,
                categoryId,
                dosageFormId,
                rxClass,
                controlled,
                antibiotic,
                storage,
                minStock,
                maxStock,
                reorder,
                organizationId,
                code,
              ]
            );
          } else {
            await connection.query(
              `INSERT INTO products (
                organization_id, code, barcode, name, description,
                category_id, dosage_form_id,
                prescription_classification, controlled_classification, antibiotic_classification, storage_requirement,
                min_stock_level, max_stock_level, reorder_level, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                organizationId,
                code,
                row.barcode?.trim() || null,
                name,
                row.description?.trim() || null,
                categoryId,
                dosageFormId,
                rxClass,
                controlled,
                antibiotic,
                storage,
                minStock,
                maxStock,
                reorder,
              ]
            );
          }
          successfulRows++;
        } else if (type === 'suppliers') {
          if (item.action === 'update' && code) {
            await connection.query(
              `UPDATE suppliers SET
                name = ?,
                contact_person = ?,
                telephone = ?,
                email = ?,
                address = ?,
                country = ?,
                tax_registration_number = ?,
                notes = ?
              WHERE organization_id = ? AND code = ?`,
              [
                name,
                row.contact_person?.trim() || null,
                row.telephone?.trim() || null,
                row.email?.trim() || null,
                row.address?.trim() || null,
                row.country?.trim() || null,
                row.tax_registration_number?.trim() || null,
                row.notes?.trim() || null,
                organizationId,
                code,
              ]
            );
          } else {
            await connection.query(
              `INSERT INTO suppliers (
                organization_id, code, name, contact_person, telephone, email, address, country, tax_registration_number, notes, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                organizationId,
                code,
                name,
                row.contact_person?.trim() || null,
                row.telephone?.trim() || null,
                row.email?.trim() || null,
                row.address?.trim() || null,
                row.country?.trim() || null,
                row.tax_registration_number?.trim() || null,
                row.notes?.trim() || null,
              ]
            );
          }
          successfulRows++;
        } else if (type === 'customers') {
          const cType = (row.customer_type || 'individual').toLowerCase().trim();
          const creditLimit = row.credit_limit ? Number(row.credit_limit) : null;

          if (item.action === 'update' && code) {
            await connection.query(
              `UPDATE customers SET
                name = ?,
                customer_type = ?,
                telephone = ?,
                email = ?,
                address = ?,
                territory = ?,
                pricing_tier = ?,
                credit_limit = ?,
                payment_terms = ?,
                notes = ?
              WHERE organization_id = ? AND code = ?`,
              [
                name,
                cType,
                row.telephone?.trim() || null,
                row.email?.trim() || null,
                row.address?.trim() || null,
                row.territory?.trim() || null,
                row.pricing_tier?.trim() || null,
                creditLimit,
                row.payment_terms?.trim() || null,
                row.notes?.trim() || null,
                organizationId,
                code,
              ]
            );
          } else {
            await connection.query(
              `INSERT INTO customers (
                organization_id, code, name, customer_type, telephone, email, address, territory, pricing_tier, credit_limit, payment_terms, notes, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
              [
                organizationId,
                code,
                name,
                cType,
                row.telephone?.trim() || null,
                row.email?.trim() || null,
                row.address?.trim() || null,
                row.territory?.trim() || null,
                row.pricing_tier?.trim() || null,
                creditLimit,
                row.payment_terms?.trim() || null,
                row.notes?.trim() || null,
              ]
            );
          }
          successfulRows++;
        }
      }

      await connection.commit();

      // Update import job status
      await importRepository.updateJob(job.id, {
        status: 'completed',
        successfulRows,
        skippedRows: 0,
        failedRows: 0,
      });

      // Audit log
      await auditService.log({
        organizationId,
        actorUserId: user.id,
        action: 'data_import.executed',
        resourceType: 'import_job',
        resourceId: job.id,
        resourceReference: job.jobUuid,
        reason: `Imported ${successfulRows} ${type} records via CSV`,
        details: { type, filename, successfulRows, totalRows: preview.totalRows },
      }).catch(() => {});

      return {
        jobId: job.id,
        jobUuid: job.jobUuid,
        status: 'completed',
        totalRows: preview.totalRows,
        successfulRows,
        skippedRows: 0,
        failedRows: 0,
      };
    } catch (err) {
      await connection.rollback();
      await importRepository.updateJob(job.id, {
        status: 'failed',
        successfulRows: 0,
        skippedRows: 0,
        failedRows: preview.totalRows,
        errorSummary: { message: err.message },
      }).catch(() => {});
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Lists import jobs history.
   */
  async listJobs({ user, page, limit }) {
    const organizationId = await resolveOrganizationId(user.id);
    return importRepository.listJobs({ organizationId, page, limit });
  }

  /**
   * Gets details of a single import job.
   */
  async getJobById({ user, id }) {
    const organizationId = await resolveOrganizationId(user.id);
    const job = await importRepository.getJobById(id, organizationId);
    if (!job) {
      throw new AppError('Import job not found.', { statusCode: 404, code: 'JOB_NOT_FOUND' });
    }
    return job;
  }
}

export default new ImportService();
