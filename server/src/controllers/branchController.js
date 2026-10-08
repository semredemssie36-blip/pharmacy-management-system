import branchService from '../services/branchService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { branches: await branchService.list(req.query, req.user?.id) } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { branch: await branchService.getById(parseIdParam(req.params.id), req.user?.id) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const branch = await branchService.create(req.body ?? {}, req.user?.id);
    res.status(201).json({ success: true, data: { branch } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const branch = await branchService.update(parseIdParam(req.params.id), req.body ?? {}, req.user?.id);
    res.json({ success: true, data: { branch } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const branch = await branchService.deactivate(parseIdParam(req.params.id), req.user?.id);
    res.json({ success: true, data: { branch } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate };
