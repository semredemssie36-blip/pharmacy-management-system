import { Router } from 'express';

import { getPool } from '../database/pool.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import authorizationService from '../services/authorizationService.js';
import { parseIdParam } from '../utils/parseId.js';

/**
 * Shared implementation for the simple organization-scoped master-data
 * entities (brand, generic, dosage form, route, category, therapeutic
 * category, manufacturer, active ingredient, unit).
 *
 * Each entity gets: list (search/status/pagination), get, create, update,
 * deactivate, activate, and the Task-04 permission + scope enforcement.
 */
export function defineMasterEntity({ key, routeKey, responseKey, table, permissionPrefix, noun, extraFields = [] }) {
  function selectFields() {
    const extras = extraFields.map((f) => `${f.column} AS ${f.key}`).join(', ');
    return `id, organization_id, name, code${extraFields.length ? ', ' + extras : ''}, status, created_at, updated_at`;
  }

  async function list({ search, status, page = 1, limit = 20, organizationId, userId } = {}) {
    const scope = await authorizationService.getUserScope(userId);
    const accessibleOrgIds = [...scope.organizationIds];

    const where = [];
    const params = [];

    if (accessibleOrgIds.length === 0) {
      return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };
    }

    where.push(`organization_id IN (${accessibleOrgIds.map(() => '?').join(',')})`);
    params.push(...accessibleOrgIds);

    if (organizationId) {
      where.push('organization_id = ?');
      params.push(Number(organizationId));
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(name LIKE ? OR code LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM ${table} ${whereSql}`, params);
    const [items] = await getPool().query(
      `SELECT ${selectFields()} FROM ${table} ${whereSql} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );
    return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
  }

  async function getById(id, userId) {
    const [rows] = await getPool().query(`SELECT ${selectFields()} FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) throw new AppError(`${noun} not found`, { statusCode: 404, code: `${key.toUpperCase()}_NOT_FOUND` });
    const scope = await authorizationService.getUserScope(userId);
    if (!scope.organizationIds.has(row.organization_id)) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }
    return row;
  }

  async function create(input, userId) {
    const details = [];
    if (!Number.isInteger(Number(input.organizationId)) || Number(input.organizationId) <= 0) {
      details.push({ field: 'organizationId', message: 'A valid organizationId is required' });
    }
    if (typeof input.name !== 'string' || !input.name.trim()) details.push({ field: 'name', message: 'Name is required' });
    if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) {
      details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
    }
    if (details.length) throw new ValidationError('Validation failed', details);

    const scope = await authorizationService.getUserScope(userId);
    if (!scope.organizationIds.has(Number(input.organizationId))) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    const extras = extraFields.length ? `, ${extraFields.map((f) => f.column).join(', ')}` : '';
    const extraValues = extraFields.map((f) => input[f.key] ?? null);
    try {
      const [result] = await getPool().query(
        `INSERT INTO ${table} (organization_id, name, code, status${extras}) VALUES (?, ?, ?, ?${extraFields.map(() => ', ?').join('')})`,
        [Number(input.organizationId), input.name.trim(), input.code?.trim() || null, input.status || 'active', ...extraValues],
      );
      return getById(result.insertId, userId);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new AppError(`${noun} code already exists in this organization`, { statusCode: 409, code: `DUPLICATE_${key.toUpperCase()}_CODE` });
      throw err;
    }
  }

  async function update(id, input, userId) {
    await getById(id, userId);
    const details = [];
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) details.push({ field: 'name', message: 'Name must not be empty' });
    if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
    if (details.length) throw new ValidationError('Validation failed', details);

    const sets = [];
    const params = [];
    if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name.trim()); }
    if (input.code !== undefined) { sets.push('code = ?'); params.push(input.code?.trim() || null); }
    if (input.status !== undefined) { sets.push('status = ?'); params.push(input.status); }
    for (const f of extraFields) {
      if (input[f.key] !== undefined) { sets.push(`${f.column} = ?`); params.push(input[f.key] === '' ? null : input[f.key]); }
    }

    if (sets.length > 0) {
      params.push(id);
      try {
        await getPool().query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, params);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw new AppError(`${noun} code already exists in this organization`, { statusCode: 409, code: `DUPLICATE_${key.toUpperCase()}_CODE` });
        throw err;
      }
    }
    return getById(id, userId);
  }

  async function deactivate(id, userId) {
    await getById(id, userId);
    await getPool().query(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`, [id]);
    return getById(id, userId);
  }

  async function activate(id, userId) {
    await getById(id, userId);
    await getPool().query(`UPDATE ${table} SET status = 'active' WHERE id = ?`, [id]);
    return getById(id, userId);
  }

  function router() {
    const r = Router();
    r.use(authenticate);

    r.get(`/${routeKey}`, requirePermission(`${permissionPrefix}.view`), async (req, res, next) => {
      try {
        res.json({ success: true, data: await list({ search: req.query.search, status: req.query.status, page: req.query.page, limit: req.query.limit, organizationId: req.query.organizationId, userId: req.user.id }) });
      } catch (err) { next(err); }
    });

    r.get(`/${routeKey}/:id`, requirePermission(`${permissionPrefix}.view`), async (req, res, next) => {
      try {
        res.json({ success: true, data: { [responseKey]: await getById(parseIdParam(req.params.id), req.user.id) } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}`, requirePermission(`${permissionPrefix}.create`), async (req, res, next) => {
      try {
        res.status(201).json({ success: true, data: { [responseKey]: await create(req.body ?? {}, req.user.id) } });
      } catch (err) { next(err); }
    });

    r.patch(`/${routeKey}/:id`, requirePermission(`${permissionPrefix}.update`), async (req, res, next) => {
      try {
        res.json({ success: true, data: { [responseKey]: await update(parseIdParam(req.params.id), req.body ?? {}, req.user.id) } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}/:id/deactivate`, requirePermission(`${permissionPrefix}.deactivate`), async (req, res, next) => {
      try {
        res.json({ success: true, data: { [responseKey]: await deactivate(parseIdParam(req.params.id), req.user.id) } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}/:id/activate`, requirePermission(`${permissionPrefix}.update`), async (req, res, next) => {
      try {
        res.json({ success: true, data: { [responseKey]: await activate(parseIdParam(req.params.id), req.user.id) } });
      } catch (err) { next(err); }
    });

    return r;
  }

  return { list, getById, create, update, deactivate, activate, router };
}
