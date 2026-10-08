import permissionService from '../services/permissionService.js';

async function list(req, res, next) {
  try {
    const { module, resource } = req.query;
    const filters = {};
    if (typeof module === 'string' && module) filters.module = module;
    if (typeof resource === 'string' && resource) filters.resource = resource;
    res.json({ success: true, data: { permissions: await permissionService.list(filters) } });
  } catch (err) { next(err); }
}

export default { list };
