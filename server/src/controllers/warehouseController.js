import warehouseService from '../services/warehouseService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { warehouses: await warehouseService.list(req.query, req.user?.id) } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { warehouse: await warehouseService.getById(parseIdParam(req.params.id), req.user?.id) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const warehouse = await warehouseService.create(req.body ?? {}, req.user?.id);
    res.status(201).json({ success: true, data: { warehouse } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const warehouse = await warehouseService.update(parseIdParam(req.params.id), req.body ?? {}, req.user?.id);
    res.json({ success: true, data: { warehouse } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const warehouse = await warehouseService.deactivate(parseIdParam(req.params.id), req.user?.id);
    res.json({ success: true, data: { warehouse } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate };
