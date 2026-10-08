import userService from '../services/userService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({ success: true, data: { users: await userService.list() } });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { user: await userService.getById(parseIdParam(req.params.id)) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const user = await userService.create(req.body ?? {});
    res.status(201).json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const user = await userService.update(parseIdParam(req.params.id), req.body ?? {});
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const user = await userService.deactivate(parseIdParam(req.params.id));
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

async function activate(req, res, next) {
  try {
    const user = await userService.activate(parseIdParam(req.params.id));
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

async function setRoles(req, res, next) {
  try {
    const user = await userService.setRoles(parseIdParam(req.params.id), req.body?.roleIds);
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

async function setScopes(req, res, next) {
  try {
    const user = await userService.setScopes(parseIdParam(req.params.id), req.body?.scopes);
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, deactivate, activate, setRoles, setScopes };
