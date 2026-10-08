import { getPool } from '../database/pool.js';

const PRESCRIPTION_FIELDS = `
  pr.id,
  pr.organization_id,
  o.name AS organization_name,
  pr.branch_id,
  b.name AS branch_name,
  b.code AS branch_code,
  pr.prescription_number,
  pr.patient_id,
  pt.patient_number,
  CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
  pt.gender AS patient_gender,
  pt.date_of_birth AS patient_dob,
  TIMESTAMPDIFF(YEAR, pt.date_of_birth, CURDATE()) AS patient_age,
  pt.phone AS patient_phone,
  pr.prescriber_id,
  dr.prescriber_number,
  dr.name AS prescriber_name,
  dr.license_number AS prescriber_license,
  dr.specialty AS prescriber_specialty,
  dr.workplace AS prescriber_workplace,
  pr.prescription_date,
  pr.expiry_date,
  pr.status,
  pr.diagnosis,
  pr.notes,
  pr.supporting_document_url,
  pr.validated_by,
  vu.name AS validated_by_name,
  pr.validated_at,
  pr.validation_notes,
  pr.cancelled_by,
  cu.name AS cancelled_by_name,
  pr.cancelled_at,
  pr.cancelled_reason,
  pr.created_by,
  u.name AS created_by_name,
  pr.created_at,
  pr.updated_at
`;

const PRESCRIPTION_JOINS = `
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN branches b ON b.id = pr.branch_id
  JOIN patients pt ON pt.id = pr.patient_id
  JOIN prescribers dr ON dr.id = pr.prescriber_id
  LEFT JOIN users vu ON vu.id = pr.validated_by
  LEFT JOIN users cu ON cu.id = pr.cancelled_by
  LEFT JOIN users u ON u.id = pr.created_by
`;

async function list({
  organizationId,
  branchId,
  accessibleOrgIds = [],
  accessibleBranchIds = [],
  patientId,
  prescriberId,
  status,
  startDate,
  endDate,
  search,
  page = 1,
  limit = 20,
  sort = 'prescription_date',
}) {
  const where = [];
  const params = [];

  // Scoping: user must have org access or branch access
  const scopeOr = [];
  if (accessibleOrgIds.length > 0) {
    scopeOr.push(`pr.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
    params.push(...accessibleOrgIds);
  }
  if (accessibleBranchIds.length > 0) {
    scopeOr.push(`pr.branch_id IN (${accessibleBranchIds.map(() => '?').join(',')})`);
    params.push(...accessibleBranchIds);
  }

  if (scopeOr.length > 0) {
    where.push(`(${scopeOr.join(' OR ')})`);
  } else if (organizationId) {
    where.push('pr.organization_id = ?');
    params.push(Number(organizationId));
  } else {
    return { items: [], total: 0, page: 1, limit: 20 };
  }

  if (organizationId) {
    where.push('pr.organization_id = ?');
    params.push(Number(organizationId));
  }

  if (branchId) {
    where.push('pr.branch_id = ?');
    params.push(Number(branchId));
  }

  if (patientId) {
    where.push('pr.patient_id = ?');
    params.push(Number(patientId));
  }

  if (prescriberId) {
    where.push('pr.prescriber_id = ?');
    params.push(Number(prescriberId));
  }

  if (status) {
    where.push('pr.status = ?');
    params.push(status);
  }

  if (startDate) {
    where.push('pr.prescription_date >= ?');
    params.push(startDate);
  }

  if (endDate) {
    where.push('pr.prescription_date <= ?');
    params.push(endDate);
  }

  if (search) {
    where.push(`(
      pr.prescription_number LIKE ?
      OR pt.patient_number LIKE ?
      OR CONCAT(pt.first_name, ' ', pt.last_name) LIKE ?
      OR dr.name LIKE ?
      OR pr.diagnosis LIKE ?
    )`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  const sortMap = {
    prescription_date: 'pr.prescription_date',
    expiry_date: 'pr.expiry_date',
    created_at: 'pr.created_at',
    prescription_number: 'pr.prescription_number',
  };
  const orderCol = sortMap[sort] || 'pr.prescription_date';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM prescriptions pr ${PRESCRIPTION_JOINS} ${whereSql}`,
    params,
  );

  const [items] = await getPool().query(
    `SELECT ${PRESCRIPTION_FIELDS} FROM prescriptions pr ${PRESCRIPTION_JOINS} ${whereSql} ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );

  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT ${PRESCRIPTION_FIELDS} FROM prescriptions pr ${PRESCRIPTION_JOINS} WHERE pr.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByPrescriptionNumber(organizationId, prescriptionNumber) {
  const [rows] = await getPool().query(
    `SELECT ${PRESCRIPTION_FIELDS} FROM prescriptions pr ${PRESCRIPTION_JOINS} WHERE pr.organization_id = ? AND pr.prescription_number = ? LIMIT 1`,
    [organizationId, prescriptionNumber],
  );
  return rows[0] || null;
}

async function getLines(prescriptionId, connection = null) {
  const runner = connection || getPool();
  const [lines] = await runner.query(
    `SELECT
      pl.id,
      pl.prescription_id,
      pl.product_id,
      p.name AS product_name,
      p.code AS product_code,
      g.name AS generic_name,
      df.name AS dosage_form_name,
      rt.name AS route_name,
      p.prescription_classification,
      p.controlled_classification,
      p.antibiotic_classification,
      pl.unit_id,
      u.name AS unit_name,
      pl.prescribed_strength,
      pl.prescribed_dosage_form,
      pl.prescribed_route,
      pl.quantity_prescribed,
      pl.quantity_dispensed,
      pl.quantity_remaining,
      pl.dosage,
      pl.frequency,
      pl.duration,
      pl.instructions,
      pl.refills_allowed,
      pl.refills_dispensed,
      pl.refills_remaining,
      pl.notes,
      pl.created_at,
      pl.updated_at
    FROM prescription_lines pl
    JOIN products p ON p.id = pl.product_id
    LEFT JOIN generics g ON g.id = p.generic_id
    LEFT JOIN dosage_forms df ON df.id = p.dosage_form_id
    LEFT JOIN routes rt ON rt.id = p.route_id
    LEFT JOIN units u ON u.id = pl.unit_id
    WHERE pl.prescription_id = ?
    ORDER BY pl.id ASC`,
    [prescriptionId],
  );

  // Attach refills for each line
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const [refills] = await runner.query(
      `SELECT id, prescription_line_id, refill_number, status, dispense_reference_id, dispensed_at, notes, created_at
       FROM prescription_refills
       WHERE prescription_line_id = ?
       ORDER BY refill_number ASC`,
      [line.id],
    );
    line.refills = refills;
  }

  return lines;
}

async function getAttachments(prescriptionId, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT pa.id, pa.prescription_id, pa.file_name, pa.file_path, pa.file_type, pa.file_size, pa.uploaded_by, u.name AS uploaded_by_name, pa.created_at
     FROM prescription_attachments pa
     LEFT JOIN users u ON u.id = pa.uploaded_by
     WHERE pa.prescription_id = ?
     ORDER BY pa.id ASC`,
    [prescriptionId],
  );
  return rows;
}

async function createPrescription(header, lines, connection) {
  const [res] = await connection.query(
    `INSERT INTO prescriptions (
      organization_id, branch_id, prescription_number, patient_id, prescriber_id,
      prescription_date, expiry_date, status, diagnosis, notes,
      supporting_document_url, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      header.organizationId,
      header.branchId || null,
      header.prescriptionNumber,
      header.patientId,
      header.prescriberId,
      header.prescriptionDate,
      header.expiryDate,
      header.status || 'draft',
      header.diagnosis || null,
      header.notes || null,
      header.supportingDocumentUrl || null,
      header.createdBy || null,
    ],
  );
  const prescriptionId = res.insertId;

  for (const line of lines) {
    const refillsAllowed = Number(line.refillsAllowed) || 0;
    // eslint-disable-next-line no-await-in-loop
    const [lineRes] = await connection.query(
      `INSERT INTO prescription_lines (
        prescription_id, product_id, unit_id, prescribed_strength,
        prescribed_dosage_form, prescribed_route, quantity_prescribed,
        quantity_dispensed, quantity_remaining, dosage, frequency,
        duration, instructions, refills_allowed, refills_dispensed,
        refills_remaining, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        prescriptionId,
        line.productId,
        line.unitId || null,
        line.prescribedStrength || null,
        line.prescribedDosageForm || null,
        line.prescribedRoute || null,
        line.quantityPrescribed,
        line.quantityPrescribed, // remaining = prescribed initially
        line.dosage,
        line.frequency,
        line.duration,
        line.instructions || null,
        refillsAllowed,
        refillsAllowed, // refills remaining = allowed initially
        line.notes || null,
      ],
    );

    const lineId = lineRes.insertId;

    // Pre-populate refill records foundation
    for (let r = 1; r <= refillsAllowed; r += 1) {
      // eslint-disable-next-line no-await-in-loop
      await connection.query(
        `INSERT INTO prescription_refills (
          prescription_line_id, refill_number, status
        ) VALUES (?, ?, 'available')`,
        [lineId, r],
      );
    }
  }

  // Supporting document attachment if provided
  if (header.supportingDocumentUrl) {
    await connection.query(
      `INSERT INTO prescription_attachments (
        prescription_id, file_name, file_path, uploaded_by
      ) VALUES (?, ?, ?, ?)`,
      [
        prescriptionId,
        header.supportingDocumentName || 'Prescription Document',
        header.supportingDocumentUrl,
        header.createdBy || null,
      ],
    );
  }

  return findById(prescriptionId, connection);
}

async function updatePrescription(id, header, lines, connection) {
  await connection.query(
    `UPDATE prescriptions SET
      branch_id = ?,
      patient_id = ?,
      prescriber_id = ?,
      prescription_date = ?,
      expiry_date = ?,
      diagnosis = ?,
      notes = ?,
      supporting_document_url = ?
    WHERE id = ?`,
    [
      header.branchId || null,
      header.patientId,
      header.prescriberId,
      header.prescriptionDate,
      header.expiryDate,
      header.diagnosis || null,
      header.notes || null,
      header.supportingDocumentUrl || null,
      id,
    ],
  );

  // Replace lines for draft prescription
  await connection.query('DELETE FROM prescription_lines WHERE prescription_id = ?', [id]);

  for (const line of lines) {
    const refillsAllowed = Number(line.refillsAllowed) || 0;
    // eslint-disable-next-line no-await-in-loop
    const [lineRes] = await connection.query(
      `INSERT INTO prescription_lines (
        prescription_id, product_id, unit_id, prescribed_strength,
        prescribed_dosage_form, prescribed_route, quantity_prescribed,
        quantity_dispensed, quantity_remaining, dosage, frequency,
        duration, instructions, refills_allowed, refills_dispensed,
        refills_remaining, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        line.productId,
        line.unitId || null,
        line.prescribedStrength || null,
        line.prescribedDosageForm || null,
        line.prescribedRoute || null,
        line.quantityPrescribed,
        line.quantityPrescribed,
        line.dosage,
        line.frequency,
        line.duration,
        line.instructions || null,
        refillsAllowed,
        refillsAllowed,
        line.notes || null,
      ],
    );

    const lineId = lineRes.insertId;

    for (let r = 1; r <= refillsAllowed; r += 1) {
      // eslint-disable-next-line no-await-in-loop
      await connection.query(
        `INSERT INTO prescription_refills (
          prescription_line_id, refill_number, status
        ) VALUES (?, ?, 'available')`,
        [lineId, r],
      );
    }
  }

  return findById(id, connection);
}

async function updateStatus(id, status, meta = {}, connection = null) {
  const runner = connection || getPool();
  const setClauses = ['status = ?'];
  const params = [status];

  if (status === 'validated') {
    setClauses.push('validated_by = ?', 'validated_at = NOW()', 'validation_notes = ?');
    params.push(meta.validatedBy || null, meta.validationNotes || null);
  } else if (status === 'cancelled') {
    setClauses.push('cancelled_by = ?', 'cancelled_at = NOW()', 'cancelled_reason = ?');
    params.push(meta.cancelledBy || null, meta.cancelledReason || null);
  }

  params.push(id);
  await runner.query(`UPDATE prescriptions SET ${setClauses.join(', ')} WHERE id = ?`, params);
  return findById(id, runner);
}

export default {
  list,
  findById,
  findByPrescriptionNumber,
  getLines,
  getAttachments,
  createPrescription,
  updatePrescription,
  updateStatus,
};
