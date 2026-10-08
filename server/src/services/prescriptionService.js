import prescriptionRepository from '../repositories/prescriptionRepository.js';
import patientRepository from '../repositories/patientRepository.js';
import prescriberRepository from '../repositories/prescriberRepository.js';
import productRepository from '../repositories/productRepository.js';
import authorizationService from './authorizationService.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import { getPool } from '../database/pool.js';

const STATUS_TRANSITIONS = {
  draft: new Set(['pending', 'cancelled']),
  pending: new Set(['validated', 'cancelled']),
  validated: new Set(['cancelled']),
  partially_dispensed: new Set([]), // Dispensing handled in Task 12
  fully_dispensed: new Set([]),
  refill_available: new Set([]),
  expired: new Set([]),
  cancelled: new Set([]),
};

async function getScopeSets(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return {
    orgIds: [...scope.organizationIds],
    branchIds: [...scope.branchIds],
    warehouseIds: [...scope.warehouseIds],
  };
}

function canAccess(scopeSets, prescription) {
  return (
    scopeSets.orgIds.includes(Number(prescription.organization_id)) ||
    (prescription.branch_id && scopeSets.branchIds.includes(Number(prescription.branch_id)))
  );
}

async function generatePrescriptionNumber(organizationId) {
  const pool = getPool();
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `RX-${organizationId}-${dateStr}-${rand}`;
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await pool.query(
      'SELECT id FROM prescriptions WHERE organization_id = ? AND prescription_number = ? LIMIT 1',
      [organizationId, candidate],
    );
    if (rows.length === 0) return candidate;
  }
  throw new AppError('Failed to generate unique prescription number, please retry', {
    statusCode: 500,
    code: 'PRESCRIPTION_NUMBER_GENERATION_FAILED',
  });
}

async function validatePrescriptionPayload(input, organizationId) {
  const errors = [];

  const patientId = Number(input.patientId);
  if (!Number.isInteger(patientId) || patientId <= 0) {
    errors.push({ field: 'patientId', message: 'Valid patientId is required' });
  }

  const prescriberId = Number(input.prescriberId);
  if (!Number.isInteger(prescriberId) || prescriberId <= 0) {
    errors.push({ field: 'prescriberId', message: 'Valid prescriberId is required' });
  }

  if (!input.prescriptionDate) {
    errors.push({ field: 'prescriptionDate', message: 'Prescription date is required' });
  }
  if (!input.expiryDate) {
    errors.push({ field: 'expiryDate', message: 'Expiry date is required' });
  }

  const rxDate = new Date(input.prescriptionDate);
  const expDate = new Date(input.expiryDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (Number.isNaN(rxDate.getTime())) {
    errors.push({ field: 'prescriptionDate', message: 'Invalid prescription date format' });
  } else if (rxDate > today) {
    errors.push({ field: 'prescriptionDate', message: 'Prescription date cannot be in the future' });
  }

  if (Number.isNaN(expDate.getTime())) {
    errors.push({ field: 'expiryDate', message: 'Invalid expiry date format' });
  } else if (expDate < rxDate) {
    errors.push({ field: 'expiryDate', message: 'Expiry date cannot be earlier than prescription date' });
  }

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    errors.push({ field: 'lines', message: 'At least one prescription line is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Verify patient existence, organization match, and active status
  const patient = await patientRepository.findById(patientId);
  if (!patient) {
    throw new AppError('Patient not found', { statusCode: 404, code: 'PATIENT_NOT_FOUND' });
  }
  if (patient.organization_id !== organizationId) {
    throw new ValidationError('Validation failed', [{ field: 'patientId', message: 'Patient belongs to another organization' }]);
  }
  if (patient.status !== 'active') {
    throw new AppError('Cannot create prescription for inactive patient', { statusCode: 409, code: 'PATIENT_INACTIVE' });
  }

  // Verify prescriber existence, organization match, and active status
  const prescriber = await prescriberRepository.findById(prescriberId);
  if (!prescriber) {
    throw new AppError('Prescriber not found', { statusCode: 404, code: 'PRESCRIBER_NOT_FOUND' });
  }
  if (prescriber.organization_id !== organizationId) {
    throw new ValidationError('Validation failed', [{ field: 'prescriberId', message: 'Prescriber belongs to another organization' }]);
  }
  if (prescriber.status !== 'active') {
    throw new AppError('Cannot create prescription for inactive prescriber', { statusCode: 409, code: 'PRESCRIBER_INACTIVE' });
  }

  // Verify and enrich lines
  const enrichedLines = [];
  for (let idx = 0; idx < input.lines.length; idx += 1) {
    const line = input.lines[idx];
    const lineErrors = [];
    const productId = Number(line.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      lineErrors.push({ field: `lines[${idx}].productId`, message: 'Valid productId is required' });
    }

    const qty = Number(line.quantityPrescribed);
    if (!Number.isFinite(qty) || qty <= 0) {
      lineErrors.push({ field: `lines[${idx}].quantityPrescribed`, message: 'Quantity prescribed must be greater than zero' });
    }

    if (!line.dosage || typeof line.dosage !== 'string' || !line.dosage.trim()) {
      lineErrors.push({ field: `lines[${idx}].dosage`, message: 'Dosage instructions required (e.g. 500mg, 1 tablet)' });
    }

    if (!line.frequency || typeof line.frequency !== 'string' || !line.frequency.trim()) {
      lineErrors.push({ field: `lines[${idx}].frequency`, message: 'Frequency required (e.g. TID, Once daily)' });
    }

    if (!line.duration || typeof line.duration !== 'string' || !line.duration.trim()) {
      lineErrors.push({ field: `lines[${idx}].duration`, message: 'Duration required (e.g. 7 days)' });
    }

    if (line.refillsAllowed !== undefined && (Number(line.refillsAllowed) < 0 || !Number.isInteger(Number(line.refillsAllowed)))) {
      lineErrors.push({ field: `lines[${idx}].refillsAllowed`, message: 'Refills allowed must be a non-negative integer' });
    }

    if (lineErrors.length > 0) {
      throw new ValidationError('Validation failed', lineErrors);
    }

    // eslint-disable-next-line no-await-in-loop
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new AppError(`Product with ID ${productId} not found`, { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    if (product.organization_id !== organizationId) {
      throw new ValidationError('Validation failed', [{ field: `lines[${idx}].productId`, message: 'Product belongs to another organization' }]);
    }
    if (product.status !== 'active') {
      throw new AppError(`Cannot prescribe inactive product "${product.name}"`, { statusCode: 409, code: 'PRODUCT_INACTIVE' });
    }

    enrichedLines.push({
      productId,
      unitId: line.unitId || null,
      prescribedStrength: line.prescribedStrength || product.strength || null,
      prescribedDosageForm: line.prescribedDosageForm || product.dosage_form_name || null,
      prescribedRoute: line.prescribedRoute || product.route_name || null,
      quantityPrescribed: qty,
      dosage: line.dosage.trim(),
      frequency: line.frequency.trim(),
      duration: line.duration.trim(),
      instructions: line.instructions ? line.instructions.trim() : null,
      refillsAllowed: Number(line.refillsAllowed) || 0,
      notes: line.notes ? line.notes.trim() : null,
    });
  }

  return { patient, prescriber, enrichedLines };
}

async function listPrescriptions(userId, filters) {
  const sets = await getScopeSets(userId);
  return prescriptionRepository.list({
    ...filters,
    accessibleOrgIds: sets.orgIds,
    accessibleBranchIds: sets.branchIds,
  });
}

async function getPrescriptionById(id, userId) {
  const prescription = await prescriptionRepository.findById(id);
  if (!prescription) throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, prescription)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  const lines = await prescriptionRepository.getLines(id);
  const attachments = await prescriptionRepository.getAttachments(id);

  return { ...prescription, lines, attachments };
}

async function createPrescription(input, userId) {
  const organizationId = Number(input.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ValidationError('Validation failed', [{ field: 'organizationId', message: 'Valid organizationId is required' }]);
  }

  const branchId = input.branchId ? Number(input.branchId) : null;
  const sets = await getScopeSets(userId);

  const hasAccess = sets.orgIds.includes(organizationId) || (branchId && sets.branchIds.includes(branchId));
  if (!hasAccess) {
    throw new AppError('You do not have access to this organization or branch.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  const { enrichedLines } = await validatePrescriptionPayload(input, organizationId);
  const prescriptionNumber = await generatePrescriptionNumber(organizationId);

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const created = await prescriptionRepository.createPrescription(
      {
        organizationId,
        branchId,
        prescriptionNumber,
        patientId: Number(input.patientId),
        prescriberId: Number(input.prescriberId),
        prescriptionDate: input.prescriptionDate,
        expiryDate: input.expiryDate,
        status: input.status === 'pending' ? 'pending' : 'draft',
        diagnosis: input.diagnosis ? input.diagnosis.trim() : null,
        notes: input.notes ? input.notes.trim() : null,
        supportingDocumentUrl: input.supportingDocumentUrl || null,
        supportingDocumentName: input.supportingDocumentName || null,
        createdBy: userId,
      },
      enrichedLines,
      connection,
    );

    await connection.commit();
    return getPrescriptionById(created.id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updatePrescription(id, input, userId) {
  const existing = await prescriptionRepository.findById(id);
  if (!existing) throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (existing.status !== 'draft') {
    throw new AppError(`Cannot update prescription with status "${existing.status}". Only draft prescriptions can be modified.`, {
      statusCode: 409,
      code: 'PRESCRIPTION_NOT_EDITABLE',
    });
  }

  const { enrichedLines } = await validatePrescriptionPayload(input, existing.organization_id);

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await prescriptionRepository.updatePrescription(
      id,
      {
        branchId: input.branchId ? Number(input.branchId) : existing.branch_id,
        patientId: Number(input.patientId),
        prescriberId: Number(input.prescriberId),
        prescriptionDate: input.prescriptionDate,
        expiryDate: input.expiryDate,
        diagnosis: input.diagnosis ? input.diagnosis.trim() : null,
        notes: input.notes ? input.notes.trim() : null,
        supportingDocumentUrl: input.supportingDocumentUrl || existing.supporting_document_url,
      },
      enrichedLines,
      connection,
    );

    await connection.commit();
    return getPrescriptionById(id, userId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function submitPrescription(id, userId) {
  const existing = await prescriptionRepository.findById(id);
  if (!existing) throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (!STATUS_TRANSITIONS[existing.status]?.has('pending')) {
    throw new AppError(`Cannot submit prescription with status "${existing.status}"`, {
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  }

  await prescriptionRepository.updateStatus(id, 'pending');
  return getPrescriptionById(id, userId);
}

/**
 * Clinical validation of prescription.
 * Does NOT consume inventory or mark as dispensed (that belongs to Task 12).
 */
async function validatePrescription(id, validationNotes, userId) {
  const existing = await prescriptionRepository.findById(id);
  if (!existing) throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (!['pending', 'draft'].includes(existing.status)) {
    throw new AppError(`Cannot validate prescription with status "${existing.status}". Must be pending or draft.`, {
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  }

  // Validate expiry
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expDate = new Date(existing.expiry_date);
  if (expDate < now) {
    throw new AppError('Cannot validate an expired prescription', {
      statusCode: 409,
      code: 'PRESCRIPTION_EXPIRED',
    });
  }

  // Validate patient is active
  const patient = await patientRepository.findById(existing.patient_id);
  if (!patient || patient.status !== 'active') {
    throw new AppError('Cannot validate prescription: patient is inactive or not found', {
      statusCode: 409,
      code: 'PATIENT_INACTIVE',
    });
  }

  // Validate prescriber is active
  const prescriber = await prescriberRepository.findById(existing.prescriber_id);
  if (!prescriber || prescriber.status !== 'active') {
    throw new AppError('Cannot validate prescription: prescriber is inactive or not found', {
      statusCode: 409,
      code: 'PRESCRIBER_INACTIVE',
    });
  }

  // Validate all medicines in lines are active
  const lines = await prescriptionRepository.getLines(id);
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const product = await productRepository.findById(line.product_id);
    if (!product || product.status !== 'active') {
      throw new AppError(`Cannot validate prescription: prescribed product "${line.product_name}" is inactive`, {
        statusCode: 409,
        code: 'PRODUCT_INACTIVE',
      });
    }
  }

  await prescriptionRepository.updateStatus(id, 'validated', {
    validatedBy: userId,
    validationNotes: validationNotes ? validationNotes.trim() : null,
  });

  return getPrescriptionById(id, userId);
}

async function cancelPrescription(id, reason, userId) {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new ValidationError('Validation failed', [{ field: 'reason', message: 'Cancellation reason is required' }]);
  }

  const existing = await prescriptionRepository.findById(id);
  if (!existing) throw new AppError('Prescription not found', { statusCode: 404, code: 'PRESCRIPTION_NOT_FOUND' });

  const sets = await getScopeSets(userId);
  if (!canAccess(sets, existing)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }

  if (!STATUS_TRANSITIONS[existing.status]?.has('cancelled')) {
    throw new AppError(`Cannot cancel prescription with status "${existing.status}"`, {
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  }

  await prescriptionRepository.updateStatus(id, 'cancelled', {
    cancelledBy: userId,
    cancelledReason: reason.trim(),
  });

  return getPrescriptionById(id, userId);
}

export default {
  listPrescriptions,
  getPrescriptionById,
  createPrescription,
  updatePrescription,
  submitPrescription,
  validatePrescription,
  cancelPrescription,
};
