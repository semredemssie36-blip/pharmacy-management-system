import { getPool } from '../database/pool.js';

const PATIENT_FIELDS = `
  p.id,
  p.organization_id,
  o.name AS organization_name,
  p.patient_number,
  p.first_name,
  p.last_name,
  CONCAT(p.first_name, ' ', p.last_name) AS full_name,
  p.gender,
  p.date_of_birth,
  TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS age,
  p.phone,
  p.email,
  p.identification_type,
  p.identification_number,
  p.address,
  p.emergency_contact_name,
  p.emergency_contact_phone,
  p.emergency_contact_relationship,
  p.blood_group,
  p.allergies,
  p.medical_history,
  p.insurance_provider,
  p.insurance_policy_number,
  p.status,
  p.notes,
  p.merged_into_patient_id,
  p.created_by,
  u.name AS created_by_name,
  p.created_at,
  p.updated_at
`;

const PATIENT_JOINS = `
  JOIN organizations o ON o.id = p.organization_id
  LEFT JOIN users u ON u.id = p.created_by
`;

async function list({
  organizationId,
  accessibleOrgIds = [],
  search,
  status,
  gender,
  page = 1,
  limit = 20,
  sort = 'created_at',
}) {
  const where = [];
  const params = [];

  if (accessibleOrgIds.length > 0) {
    where.push(`p.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
    params.push(...accessibleOrgIds);
  } else if (organizationId) {
    where.push('p.organization_id = ?');
    params.push(Number(organizationId));
  } else {
    return { items: [], total: 0, page: 1, limit: 20 };
  }

  if (organizationId) {
    where.push('p.organization_id = ?');
    params.push(Number(organizationId));
  }

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  if (gender) {
    where.push('p.gender = ?');
    params.push(gender);
  }

  if (search) {
    where.push(`(
      p.patient_number LIKE ?
      OR p.first_name LIKE ?
      OR p.last_name LIKE ?
      OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?
      OR p.phone LIKE ?
      OR p.identification_number LIKE ?
      OR p.email LIKE ?
    )`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s, s);
  }

  const sortMap = {
    created_at: 'p.created_at',
    name: 'p.first_name',
    patient_number: 'p.patient_number',
    dob: 'p.date_of_birth',
  };
  const orderCol = sortMap[sort] || 'p.created_at';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM patients p ${whereSql}`,
    params,
  );

  const [items] = await getPool().query(
    `SELECT ${PATIENT_FIELDS} FROM patients p ${PATIENT_JOINS} ${whereSql} ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );

  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT ${PATIENT_FIELDS} FROM patients p ${PATIENT_JOINS} WHERE p.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByPatientNumber(organizationId, patientNumber) {
  const [rows] = await getPool().query(
    `SELECT ${PATIENT_FIELDS} FROM patients p ${PATIENT_JOINS} WHERE p.organization_id = ? AND p.patient_number = ? LIMIT 1`,
    [organizationId, patientNumber],
  );
  return rows[0] || null;
}

async function create(data, connection = null) {
  const runner = connection || getPool();
  const [res] = await runner.query(
    `INSERT INTO patients (
      organization_id, patient_number, first_name, last_name, gender, date_of_birth,
      phone, email, identification_type, identification_number, address,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      blood_group, allergies, medical_history, insurance_provider, insurance_policy_number,
      status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.organizationId,
      data.patientNumber,
      data.firstName,
      data.lastName,
      data.gender,
      data.dateOfBirth,
      data.phone || null,
      data.email || null,
      data.identificationType || null,
      data.identificationNumber || null,
      data.address || null,
      data.emergencyContactName || null,
      data.emergencyContactPhone || null,
      data.emergencyContactRelationship || null,
      data.bloodGroup || null,
      data.allergies || null,
      data.medicalHistory || null,
      data.insuranceProvider || null,
      data.insurancePolicyNumber || null,
      data.status || 'active',
      data.notes || null,
      data.createdBy || null,
    ],
  );
  return findById(res.insertId, runner);
}

async function update(id, data, connection = null) {
  const runner = connection || getPool();
  await runner.query(
    `UPDATE patients SET
      first_name = ?,
      last_name = ?,
      gender = ?,
      date_of_birth = ?,
      phone = ?,
      email = ?,
      identification_type = ?,
      identification_number = ?,
      address = ?,
      emergency_contact_name = ?,
      emergency_contact_phone = ?,
      emergency_contact_relationship = ?,
      blood_group = ?,
      allergies = ?,
      medical_history = ?,
      insurance_provider = ?,
      insurance_policy_number = ?,
      notes = ?
    WHERE id = ?`,
    [
      data.firstName,
      data.lastName,
      data.gender,
      data.dateOfBirth,
      data.phone || null,
      data.email || null,
      data.identificationType || null,
      data.identificationNumber || null,
      data.address || null,
      data.emergencyContactName || null,
      data.emergencyContactPhone || null,
      data.emergencyContactRelationship || null,
      data.bloodGroup || null,
      data.allergies || null,
      data.medicalHistory || null,
      data.insuranceProvider || null,
      data.insurancePolicyNumber || null,
      data.notes || null,
      id,
    ],
  );
  return findById(id, runner);
}

async function updateStatus(id, status, connection = null) {
  const runner = connection || getPool();
  await runner.query('UPDATE patients SET status = ? WHERE id = ?', [status, id]);
  return findById(id, runner);
}

async function findDuplicates({
  organizationId,
  phone,
  identificationNumber,
  firstName,
  lastName,
  dateOfBirth,
  excludeId = null,
}) {
  const conditions = [];
  const params = [organizationId];

  if (excludeId) {
    params.push(excludeId);
  }

  // Exact phone match
  if (phone && phone.trim()) {
    conditions.push('p.phone = ?');
    params.push(phone.trim());
  }

  // Exact identification number match
  if (identificationNumber && identificationNumber.trim()) {
    conditions.push('p.identification_number = ?');
    params.push(identificationNumber.trim());
  }

  // Exact name and DOB match
  if (firstName && lastName && dateOfBirth) {
    conditions.push('(p.first_name = ? AND p.last_name = ? AND p.date_of_birth = ?)');
    params.push(firstName.trim(), lastName.trim(), dateOfBirth);
  }

  if (conditions.length === 0) return [];

  const excludeSql = excludeId ? 'AND p.id != ?' : '';
  const query = `
    SELECT ${PATIENT_FIELDS}
    FROM patients p
    ${PATIENT_JOINS}
    WHERE p.organization_id = ?
      ${excludeSql}
      AND (${conditions.join(' OR ')})
    LIMIT 20
  `;

  const [rows] = await getPool().query(query, params);
  return rows.map((r) => {
    const reasons = [];
    if (phone && r.phone === phone.trim()) reasons.push('phone');
    if (identificationNumber && r.identification_number === identificationNumber.trim()) reasons.push('identification_number');
    if (firstName && lastName && dateOfBirth && r.first_name.toLowerCase() === firstName.trim().toLowerCase() && r.last_name.toLowerCase() === lastName.trim().toLowerCase() && String(r.date_of_birth).slice(0, 10) === String(dateOfBirth).slice(0, 10)) {
      reasons.push('name_and_dob');
    }
    return { ...r, duplicate_reasons: reasons };
  });
}

async function getPrescriptions(patientId) {
  const [rows] = await getPool().query(
    `SELECT
      pr.id,
      pr.prescription_number,
      pr.prescription_date,
      pr.expiry_date,
      pr.status,
      pr.diagnosis,
      pr.prescriber_id,
      d.name AS prescriber_name,
      b.name AS branch_name,
      pr.created_at
    FROM prescriptions pr
    LEFT JOIN prescribers d ON d.id = pr.prescriber_id
    LEFT JOIN branches b ON b.id = pr.branch_id
    WHERE pr.patient_id = ?
    ORDER BY pr.prescription_date DESC, pr.id DESC`,
    [patientId],
  );
  return rows;
}

export default {
  list,
  findById,
  findByPatientNumber,
  create,
  update,
  updateStatus,
  findDuplicates,
  getPrescriptions,
};
