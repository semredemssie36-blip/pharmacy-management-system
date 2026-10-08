import prescriberService from '../services/prescriberService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await prescriberService.listPrescribers(req.user.id, {
      search: req.query.search,
      status: req.query.status,
      specialty: req.query.specialty,
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
    const prescriber = await prescriberService.getPrescriberById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { prescriber } });
  } catch (err) {
    next(err);
  }
}

async function getPrescriptions(req, res, next) {
  try {
    const result = await prescriberService.getPrescriberPrescriptions(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const prescriber = await prescriberService.createPrescriber(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { prescriber } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const prescriber = await prescriberService.updatePrescriber(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { prescriber } });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const prescriber = await prescriberService.updatePrescriberStatus(parseIdParam(req.params.id), req.body?.status, req.user.id);
    res.json({ success: true, data: { prescriber } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getPrescriptions,
  create,
  update,
  updateStatus,
};
