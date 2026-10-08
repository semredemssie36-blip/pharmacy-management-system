import { getPool } from '../database/pool.js';

const PRESCRIBER_FIELDS = `
  pr.id,
  pr.organization_id,
  o.name AS organization_name,
  pr.prescriber_number,
  pr.name,
  pr.license_number,
  pr.specialty,
  pr.workplace,
  pr.phone,
  pr.email,
  pr.address,
  pr.status,
  pr.notes,
  pr.created_by,
  u.name AS created_by_name,
  pr.created_at,
  pr.updated_at
`;

const PRESCRIBER_JOINS = `
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN users u ON u.id = pr.created_by
`;

async function list({
  organizationId,
  accessibleOrgIds = [],
  search,
  status,
  specialty,
  page = 1,
  limit = 20,
  sort = 'created_at',
}) {
  const where = [];
  const params = [];

  if (accessibleOrgIds.length > 0) {
    where.push(`pr.organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
    params.push(...accessibleOrgIds);
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

  if (status) {
    where.push('pr.status = ?');
    params.push(status);
  }

  if (specialty) {
    where.push('pr.specialty = ?');
    params.push(specialty);
  }

  if (search) {
    where.push(`(
      pr.prescriber_number LIKE ?
      OR pr.name LIKE ?
      OR pr.license_number LIKE ?
      OR pr.specialty LIKE ?
      OR pr.workplace LIKE ?
      OR pr.phone LIKE ?
      OR pr.email LIKE ?
    )`);
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s, s);
  }

  const sortMap = {
    created_at: 'pr.created_at',
    name: 'pr.name',
    prescriber_number: 'pr.prescriber_number',
    license: 'pr.license_number',
  };
  const orderCol = sortMap[sort] || 'pr.created_at';
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM prescribers pr ${whereSql}`,
    params,
  );

  const [items] = await getPool().query(
    `SELECT ${PRESCRIBER_FIELDS} FROM prescribers pr ${PRESCRIBER_JOINS} ${whereSql} ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset],
  );

  return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
}

async function findById(id, connection = null) {
  const runner = connection || getPool();
  const [rows] = await runner.query(
    `SELECT ${PRESCRIBER_FIELDS} FROM prescribers pr ${PRESCRIBER_JOINS} WHERE pr.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByPrescriberNumber(organizationId, prescriberNumber) {
  const [rows] = await getPool().query(
    `SELECT ${PRESCRIBER_FIELDS} FROM prescribers pr ${PRESCRIBER_JOINS} WHERE pr.organization_id = ? AND pr.prescriber_number = ? LIMIT 1`,
    [organizationId, prescriberNumber],
  );
  return rows[0] || null;
}

async function findByLicenseNumber(organizationId, licenseNumber) {
  if (!licenseNumber || !licenseNumber.trim()) return null;
  const [rows] = await getPool().query(
    `SELECT ${PRESCRIBER_FIELDS} FROM prescribers pr ${PRESCRIBER_JOINS} WHERE pr.organization_id = ? AND pr.license_number = ? LIMIT 1`,
    [organizationId, licenseNumber.trim()],
  );
  return rows[0] || null;
}

async function create(data, connection = null) {
  const runner = connection || getPool();
  const [res] = await runner.query(
    `INSERT INTO prescribers (
      organization_id, prescriber_number, name, license_number, specialty,
      workplace, phone, email, address, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.organizationId,
      data.prescriberNumber,
      data.name,
      data.licenseNumber || null,
      data.specialty || null,
      data.workplace || null,
      data.phone || null,
      data.email || null,
      data.address || null,
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
    `UPDATE prescribers SET
      name = ?,
      license_number = ?,
      specialty = ?,
      workplace = ?,
      phone = ?,
      email = ?,
      address = ?,
      notes = ?
    WHERE id = ?`,
    [
      data.name,
      data.licenseNumber || null,
      data.specialty || null,
      data.workplace || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.notes || null,
      id,
    ],
  );
  return findById(id, runner);
}

async function updateStatus(id, status, connection = null) {
  const runner = connection || getPool();
  await runner.query('UPDATE prescribers SET status = ? WHERE id = ?', [status, id]);
  return findById(id, runner);
}

async function getPrescriptions(prescriberId) {
  const [rows] = await getPool().query(
    `SELECT
      pr.id,
      pr.prescription_number,
      pr.prescription_date,
      pr.expiry_date,
      pr.status,
      pr.patient_id,
      CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
      b.name AS branch_name,
      pr.created_at
    FROM prescriptions pr
    LEFT JOIN patients pt ON pt.id = pr.patient_id
    LEFT JOIN branches b ON b.id = pr.branch_id
    WHERE pr.prescriber_id = ?
    ORDER BY pr.prescription_date DESC, pr.id DESC`,
    [prescriberId],
  );
  return rows;
}

export default {
  list,
  findById,
  findByPrescriberNumber,
  findByLicenseNumber,
  create,
  update,
  updateStatus,
  getPrescriptions,
};
