import { getPool } from '../database/pool.js';

export const dispensingRepository = {
  async listDispensings({
    organizationId,
    branchId,
    warehouseId,
    patientId,
    prescriptionId,
    status,
    search,
    page = 1,
    limit = 20,
  }) {
    const pool = getPool();
    const whereClauses = ['d.organization_id = ?'];
    const params = [organizationId];

    if (branchId) {
      whereClauses.push('d.branch_id = ?');
      params.push(branchId);
    }

    if (warehouseId) {
      whereClauses.push('d.warehouse_id = ?');
      params.push(warehouseId);
    }

    if (patientId) {
      whereClauses.push('d.patient_id = ?');
      params.push(patientId);
    }

    if (prescriptionId) {
      whereClauses.push('d.prescription_id = ?');
      params.push(prescriptionId);
    }

    if (status) {
      whereClauses.push('d.status = ?');
      params.push(status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push(
        '(d.dispensing_number LIKE ? OR rx.prescription_number LIKE ? OR pat.first_name LIKE ? OR pat.last_name LIKE ? OR pat.patient_number LIKE ?)',
      );
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM dispensings d
       JOIN prescriptions rx ON rx.id = d.prescription_id
       JOIN patients pat ON pat.id = d.patient_id
       WHERE ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [items] = await pool.query(
      `SELECT d.id, d.organization_id, d.branch_id, d.warehouse_id,
              d.prescription_id, d.patient_id, d.dispensing_number,
              d.dispensing_date, d.status, d.notes,
              d.verified_by, d.verified_at, d.verification_notes,
              d.rejected_by, d.rejected_at, d.rejection_reason,
              d.cancelled_by, d.cancelled_at, d.cancelled_reason,
              d.created_by, d.created_at, d.updated_at,
              rx.prescription_number,
              pat.patient_number,
              CONCAT(pat.first_name, ' ', pat.last_name) AS patient_name,
              b.name AS branch_name,
              w.name AS warehouse_name,
              u.name AS created_by_name,
              vu.name AS verified_by_name,
              (SELECT COUNT(*) FROM dispensing_lines dl WHERE dl.dispensing_id = d.id) AS lines_count
       FROM dispensings d
       JOIN prescriptions rx ON rx.id = d.prescription_id
       JOIN patients pat ON pat.id = d.patient_id
       JOIN branches b ON b.id = d.branch_id
       JOIN warehouses w ON w.id = d.warehouse_id
       JOIN users u ON u.id = d.created_by
       LEFT JOIN users vu ON vu.id = d.verified_by
       WHERE ${whereSql}
       ORDER BY d.id DESC
       LIMIT ? OFFSET ?`,
      queryParams,
    );

    return { items, total };
  },

  async findById(id, connection) {
    const runner = connection || getPool();
    const [rows] = await runner.query(
      `SELECT d.id, d.organization_id, d.branch_id, d.warehouse_id,
              d.prescription_id, d.patient_id, d.dispensing_number,
              d.dispensing_date, d.status, d.notes,
              d.verified_by, d.verified_at, d.verification_notes,
              d.rejected_by, d.rejected_at, d.rejection_reason,
              d.cancelled_by, d.cancelled_at, d.cancelled_reason,
              d.created_by, d.created_at, d.updated_at,
              rx.prescription_number, rx.prescription_date, rx.expiry_date AS prescription_expiry_date,
              rx.status AS prescription_status,
              pat.patient_number,
              CONCAT(pat.first_name, ' ', pat.last_name) AS patient_name,
              pat.allergies AS patient_allergies,
              b.name AS branch_name,
              w.name AS warehouse_name,
              u.name AS created_by_name,
              vu.name AS verified_by_name,
              ru.name AS rejected_by_name,
              cu.name AS cancelled_by_name
       FROM dispensings d
       JOIN prescriptions rx ON rx.id = d.prescription_id
       JOIN patients pat ON pat.id = d.patient_id
       JOIN branches b ON b.id = d.branch_id
       JOIN warehouses w ON w.id = d.warehouse_id
       JOIN users u ON u.id = d.created_by
       LEFT JOIN users vu ON vu.id = d.verified_by
       LEFT JOIN users ru ON ru.id = d.rejected_by
       LEFT JOIN users cu ON cu.id = d.cancelled_by
       WHERE d.id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async getLines(dispensingId, connection) {
    const runner = connection || getPool();
    const [lines] = await runner.query(
      `SELECT dl.id, dl.dispensing_id, dl.prescription_line_id,
              dl.product_id, dl.unit_id,
              dl.quantity_requested, dl.quantity_allocated, dl.quantity_dispensed,
              dl.notes, dl.created_at, dl.updated_at,
              p.code AS product_code, p.name AS product_name,
              p.prescription_classification, p.controlled_classification, p.antibiotic_classification,
              u.name AS unit_name, u.code AS unit_code,
              pl.quantity_prescribed, pl.quantity_dispensed AS rx_quantity_dispensed,
              pl.quantity_remaining AS rx_quantity_remaining,
              pl.dosage, pl.frequency, pl.duration, pl.instructions,
              pl.prescribed_strength, pl.prescribed_dosage_form, pl.prescribed_route,
              pl.refills_allowed, pl.refills_remaining
       FROM dispensing_lines dl
       JOIN products p ON p.id = dl.product_id
       JOIN units u ON u.id = dl.unit_id
       JOIN prescription_lines pl ON pl.id = dl.prescription_line_id
       WHERE dl.dispensing_id = ?
       ORDER BY dl.id ASC`,
      [dispensingId],
    );
    return lines;
  },

  async getAllocations(dispensingLineId, connection) {
    const runner = connection || getPool();
    const [allocs] = await runner.query(
      `SELECT dba.id, dba.dispensing_line_id, dba.inventory_id, dba.batch_id,
              dba.storage_location_id, dba.unit_id, dba.quantity, dba.status,
              dba.allocated_at,
              b.batch_number, b.expiry_date,
              sl.name AS storage_location_name, sl.code AS storage_location_code,
              u.name AS unit_name, u.code AS unit_code
       FROM dispensing_batch_allocations dba
       JOIN batches b ON b.id = dba.batch_id
       JOIN storage_locations sl ON sl.id = dba.storage_location_id
       JOIN units u ON u.id = dba.unit_id
       WHERE dba.dispensing_line_id = ?
       ORDER BY dba.id ASC`,
      [dispensingLineId],
    );
    return allocs;
  },

  async getAllocationsByDispensing(dispensingId, connection) {
    const runner = connection || getPool();
    const [allocs] = await runner.query(
      `SELECT dba.id, dba.dispensing_line_id, dba.inventory_id, dba.batch_id,
              dba.storage_location_id, dba.unit_id, dba.quantity, dba.status,
              dba.allocated_at,
              b.batch_number, b.expiry_date,
              sl.name AS storage_location_name, sl.code AS storage_location_code,
              u.name AS unit_name, u.code AS unit_code,
              dl.product_id
       FROM dispensing_batch_allocations dba
       JOIN dispensing_lines dl ON dl.id = dba.dispensing_line_id
       JOIN batches b ON b.id = dba.batch_id
       JOIN storage_locations sl ON sl.id = dba.storage_location_id
       JOIN units u ON u.id = dba.unit_id
       WHERE dl.dispensing_id = ?
       ORDER BY dba.id ASC`,
      [dispensingId],
    );
    return allocs;
  },

  async createDispensing(header, lines, connection) {
    const runner = connection || getPool();

    const [dispRes] = await runner.query(
      `INSERT INTO dispensings (
        organization_id, branch_id, warehouse_id,
        prescription_id, patient_id, dispensing_number,
        dispensing_date, status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        header.organizationId,
        header.branchId,
        header.warehouseId,
        header.prescriptionId,
        header.patientId,
        header.dispensingNumber,
        header.dispensingDate || new Date(),
        header.status || 'draft',
        header.notes || null,
        header.createdBy,
      ],
    );
    const dispensingId = dispRes.insertId;

    for (const l of lines) {
      await runner.query(
        `INSERT INTO dispensing_lines (
          dispensing_id, prescription_line_id, product_id,
          unit_id, quantity_requested, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dispensingId,
          l.prescriptionLineId,
          l.productId,
          l.unitId,
          l.quantityRequested,
          l.notes || null,
        ],
      );
    }

    return dispensingId;
  },

  async updateStatus(id, status, fields = {}, connection) {
    const runner = connection || getPool();
    const setClauses = ['status = ?'];
    const params = [status];

    if (fields.verifiedBy !== undefined) {
      setClauses.push('verified_by = ?');
      params.push(fields.verifiedBy);
    }
    if (fields.verifiedAt !== undefined) {
      setClauses.push('verified_at = ?');
      params.push(fields.verifiedAt);
    }
    if (fields.verificationNotes !== undefined) {
      setClauses.push('verification_notes = ?');
      params.push(fields.verificationNotes);
    }
    if (fields.rejectedBy !== undefined) {
      setClauses.push('rejected_by = ?');
      params.push(fields.rejectedBy);
    }
    if (fields.rejectedAt !== undefined) {
      setClauses.push('rejected_at = ?');
      params.push(fields.rejectedAt);
    }
    if (fields.rejectionReason !== undefined) {
      setClauses.push('rejection_reason = ?');
      params.push(fields.rejectionReason);
    }
    if (fields.cancelledBy !== undefined) {
      setClauses.push('cancelled_by = ?');
      params.push(fields.cancelledBy);
    }
    if (fields.cancelledAt !== undefined) {
      setClauses.push('cancelled_at = ?');
      params.push(fields.cancelledAt);
    }
    if (fields.cancelledReason !== undefined) {
      setClauses.push('cancelled_reason = ?');
      params.push(fields.cancelledReason);
    }

    params.push(id);
    await runner.query(
      `UPDATE dispensings SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    );
  },
};

export default dispensingRepository;
