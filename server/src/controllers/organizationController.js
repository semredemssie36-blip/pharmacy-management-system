import organizationService from '../services/organizationService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { organizations: await organizationService.list(req.user?.id) } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    res.json({ success: true, data: { organization: await organizationService.getById(id, req.user?.id) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const organization = await organizationService.create(req.body ?? {});
    res.status(201).json({ success: true, data: { organization } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const organization = await organizationService.update(id, req.body ?? {}, req.user?.id);
    res.json({ success: true, data: { organization } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const organization = await organizationService.deactivate(id, req.user?.id);
    res.json({ success: true, data: { organization } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate };
