import storageLocationService from '../services/storageLocationService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { storageLocations: await storageLocationService.list(req.query, req.user?.id) } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { storageLocation: await storageLocationService.getById(parseIdParam(req.params.id), req.user?.id) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const storageLocation = await storageLocationService.create(req.body ?? {}, req.user?.id);
    res.status(201).json({ success: true, data: { storageLocation } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const storageLocation = await storageLocationService.update(parseIdParam(req.params.id), req.body ?? {}, req.user?.id);
    res.json({ success: true, data: { storageLocation } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const storageLocation = await storageLocationService.deactivate(parseIdParam(req.params.id), req.user?.id);
    res.json({ success: true, data: { storageLocation } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate };
