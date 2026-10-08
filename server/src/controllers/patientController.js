import patientService from '../services/patientService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await patientService.listPatients(req.user.id, {
      search: req.query.search,
      status: req.query.status,
      gender: req.query.gender,
      organizationId: req.query.organizationId,
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const patient = await patientService.getPatientById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { patient } });
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const result = await patientService.getPatientHistory(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function checkDuplicates(req, res, next) {
  try {
    const duplicates = await patientService.findPossibleDuplicates(req.user.id, {
      organizationId: req.query.organizationId,
      phone: req.query.phone,
      identificationNumber: req.query.identificationNumber,
      firstName: req.query.firstName,
      lastName: req.query.lastName,
      dateOfBirth: req.query.dateOfBirth,
      excludeId: req.query.excludeId,
    });
    res.json({ success: true, data: { duplicates } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const patient = await patientService.createPatient(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { patient } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const patient = await patientService.updatePatient(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { patient } });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const patient = await patientService.updatePatientStatus(parseIdParam(req.params.id), req.body?.status, req.user.id);
    res.json({ success: true, data: { patient } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getHistory,
  checkDuplicates,
  create,
  update,
  updateStatus,
};
