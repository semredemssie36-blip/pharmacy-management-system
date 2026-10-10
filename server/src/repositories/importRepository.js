import { randomUUID } from 'crypto';
import { getPool } from '../database/pool.js';

class ImportRepository {
  /**
   * Creates an import job record.
   */
  async createJob({
    organizationId,
    userId,
    importType,
    filename,
    status = 'pending',
    totalRows = 0,
    successfulRows = 0,
    skippedRows = 0,
    failedRows = 0,
    errorSummary = null,
  }) {
    const pool = getPool();
    const jobUuid = randomUUID();

    const sql = `
      INSERT INTO import_jobs (
        job_uuid,
        organization_id,
        initiated_by,
        import_type,
        original_filename,
        status,
        total_rows,
        successful_rows,
        skipped_rows,
        failed_rows,
        error_summary,
        started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [res] = await pool.query(sql, [
      jobUuid,
      organizationId,
      userId,
      importType,
      filename || 'import.csv',
      status,
      totalRows,
      successfulRows,
      skippedRows,
      failedRows,
      errorSummary ? JSON.stringify(errorSummary) : null,
    ]);

    return {
      id: res.insertId,
      jobUuid,
      status,
    };
  }

  /**
   * Updates an import job record with completion status and row counts.
   */
  async updateJob(id, { status, successfulRows, skippedRows, failedRows, errorSummary }) {
    const pool = getPool();
    const sets = ['status = ?', 'completed_at = NOW()'];
    const params = [status];

    if (successfulRows !== undefined) {
      sets.push('successful_rows = ?');
      params.push(successfulRows);
    }
    if (skippedRows !== undefined) {
      sets.push('skipped_rows = ?');
      params.push(skippedRows);
    }
    if (failedRows !== undefined) {
      sets.push('failed_rows = ?');
      params.push(failedRows);
    }
    if (errorSummary !== undefined) {
      sets.push('error_summary = ?');
      params.push(errorSummary ? JSON.stringify(errorSummary) : null);
    }

    params.push(id);
    await pool.query(`UPDATE import_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  /**
   * Fetches an import job by ID.
   */
  async getJobById(id, organizationId) {
    const pool = getPool();
    const sql = `
      SELECT 
        j.*,
        u.name AS initiated_by_name,
        u.email AS initiated_by_email
      FROM import_jobs j
      JOIN users u ON u.id = j.initiated_by
      WHERE j.id = ? AND j.organization_id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(sql, [id, organizationId]);
    return rows[0] || null;
  }

  /**
   * Lists import jobs for an organization.
   */
  async listJobs({ organizationId, page = 1, limit = 20 }) {
    const pool = getPool();
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM import_jobs WHERE organization_id = ?',
      [organizationId]
    );

    const [rows] = await pool.query(
      `SELECT 
        j.*,
        u.name AS initiated_by_name
      FROM import_jobs j
      JOIN users u ON u.id = j.initiated_by
      WHERE j.organization_id = ?
      ORDER BY j.started_at DESC
      LIMIT ? OFFSET ?`,
      [organizationId, limitNum, offset]
    );

    return {
      items: rows,
      total: countRows[0].total,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * Lookups master categories by code.
   */
  async getCategoryByCode(organizationId, code) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, code, name FROM categories WHERE organization_id = ? AND code = ? LIMIT 1',
      [organizationId, code]
    );
    return rows[0] || null;
  }

  /**
   * Lookups dosage form by code.
   */
  async getDosageFormByCode(organizationId, code) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, code, name FROM dosage_forms WHERE organization_id = ? AND code = ? LIMIT 1',
      [organizationId, code]
    );
    return rows[0] || null;
  }

  /**
   * Returns a map of existing product codes in organization.
   */
  async getExistingProductCodes(organizationId, codes) {
    if (!codes || codes.length === 0) return new Map();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, code, barcode FROM products WHERE organization_id = ? AND code IN (${codes.map(() => '?').join(',')})`,
      [organizationId, ...codes]
    );
    const map = new Map();
    rows.forEach((r) => map.set(r.code, r));
    return map;
  }

  /**
   * Returns a map of existing supplier codes in organization.
   */
  async getExistingSupplierCodes(organizationId, codes) {
    if (!codes || codes.length === 0) return new Map();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, code FROM suppliers WHERE organization_id = ? AND code IN (${codes.map(() => '?').join(',')})`,
      [organizationId, ...codes]
    );
    const map = new Map();
    rows.forEach((r) => map.set(r.code, r));
    return map;
  }

  /**
   * Returns a map of existing customer codes in organization.
   */
  async getExistingCustomerCodes(organizationId, codes) {
    if (!codes || codes.length === 0) return new Map();
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, code FROM customers WHERE organization_id = ? AND code IN (${codes.map(() => '?').join(',')})`,
      [organizationId, ...codes]
    );
    const map = new Map();
    rows.forEach((r) => map.set(r.code, r));
    return map;
  }
}

export default new ImportRepository();
