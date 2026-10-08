import prescriptionService from '../services/prescriptionService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await prescriptionService.listPrescriptions(req.user.id, {
      search: req.query.search,
      status: req.query.status,
      patientId: req.query.patientId,
      prescriberId: req.query.prescriberId,
      branchId: req.query.branchId,
      organizationId: req.query.organizationId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
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
    const prescription = await prescriptionService.getPrescriptionById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const prescription = await prescriptionService.createPrescription(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const prescription = await prescriptionService.updatePrescription(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const prescription = await prescriptionService.submitPrescription(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

async function validate(req, res, next) {
  try {
    const prescription = await prescriptionService.validatePrescription(
      parseIdParam(req.params.id),
      req.body?.validationNotes,
      req.user.id,
    );
    res.json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const prescription = await prescriptionService.cancelPrescription(
      parseIdParam(req.params.id),
      req.body?.reason,
      req.user.id,
    );
    res.json({ success: true, data: { prescription } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  create,
  update,
  submit,
  validate,
  cancel,
};
