import roleService from '../services/roleService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { roles: await roleService.list() } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { role: await roleService.getById(parseIdParam(req.params.id)) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const role = await roleService.create(req.body ?? {});
    res.status(201).json({ success: true, data: { role } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const role = await roleService.update(parseIdParam(req.params.id), req.body ?? {});
    res.json({ success: true, data: { role } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const role = await roleService.deactivate(parseIdParam(req.params.id));
    res.json({ success: true, data: { role } });
  } catch (err) { next(err); }
}

async function setPermissions(req, res, next) {
  try {
    const role = await roleService.setPermissions(parseIdParam(req.params.id), req.body?.permissionIds);
    res.json({ success: true, data: { role } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate, setPermissions };
