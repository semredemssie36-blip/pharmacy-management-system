import { Router } from 'express';

import { getPool } from '../database/pool.js';
import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import authorizationService from '../services/authorizationService.js';
import { parseIdParam } from '../utils/parseId.js';

/**
 * Organization-level partner (supplier/customer) resource factory.
 * Suppliers and customers are NOT branch- or warehouse-scoped and are never
 * merged with Manufacturers/Products/Batches/Patients.
 */
export function definePartnerResource(config) {
  const { key, routeKey, responseKey, table, permissionPrefix, noun, extraFields, validate } = config;

  async function scopeOrgIds(userId) {
    const scope = await authorizationService.getUserScope(userId);
    const orgIds = new Set(scope.organizationIds);

    // If user has branch scopes, resolve parent organizations
    if (scope.branchIds.size > 0) {
      const runner = getPool();
      const branchArr = [...scope.branchIds];
      const [bRows] = await runner.query(
        `SELECT DISTINCT organization_id FROM branches WHERE id IN (${branchArr.map(() => '?').join(',')})`,
        branchArr,
      );
      bRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }

    // If user has warehouse scopes, resolve parent organizations
    if (scope.warehouseIds.size > 0) {
      const runner = getPool();
      const whArr = [...scope.warehouseIds];
      const [wRows] = await runner.query(
        `SELECT DISTINCT organization_id FROM warehouses WHERE id IN (${whArr.map(() => '?').join(',')})`,
        whArr,
      );
      wRows.forEach((r) => orgIds.add(Number(r.organization_id)));
    }

    // Fallback: If no explicit scopes, resolve user's assigned organization or system default
    if (orgIds.size === 0) {
      const runner = getPool();
      const [uRows] = await runner.query(`SELECT organization_id FROM users WHERE id = ?`, [userId]);
      if (uRows[0]?.organization_id) {
        orgIds.add(Number(uRows[0].organization_id));
      } else {
        const [oRows] = await runner.query(`SELECT id FROM organizations WHERE status = 'active' LIMIT 1`);
        if (oRows[0]?.id) orgIds.add(Number(oRows[0].id));
      }
    }

    return [...orgIds];
  }

  async function list(userId, { search, status, page = 1, limit = 20, sort = 'created_at', organizationId } = {}) {
    const accessible = await scopeOrgIds(userId);
    if (accessible.length === 0) return { items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 20 };

    const where = [];
    const params = [];
    where.push(`organization_id IN (${accessible.map(() => '?').join(',')})`);
    params.push(...accessible);

    if (organizationId) { where.push('organization_id = ?'); params.push(Number(organizationId)); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (search) {
      where.push('(name LIKE ? OR code LIKE ? OR telephone LIKE ? OR email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const sortMap = { created_at: 'created_at', name: 'name' };
    const orderColumn = sortMap[sort] || 'created_at';
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [countRows] = await getPool().query(`SELECT COUNT(*) AS total FROM ${table} ${whereSql}`, params);
    const [items] = await getPool().query(`SELECT * FROM ${table} ${whereSql} ORDER BY ${orderColumn} LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
    return { items, total: countRows[0].total, page: pageNum, limit: limitNum };
  }

  async function getById(id, userId) {
    const [rows] = await getPool().query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) throw new AppError(`${noun} not found`, { statusCode: 404, code: `${key.toUpperCase()}_NOT_FOUND` });
    const scopes = await scopeOrgIds(userId);
    if (!scopes.includes(row.organization_id)) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }
    return row;
  }

  async function create(input, userId) {
    const scopes = await scopeOrgIds(userId);
    if (!input.organizationId && scopes.length > 0) {
      input.organizationId = scopes[0];
    }

    const details = [];
    if (!Number.isInteger(Number(input.organizationId)) || Number(input.organizationId) <= 0) details.push({ field: 'organizationId', message: 'A valid organizationId is required' });
    if (typeof input.name !== 'string' || !input.name.trim()) details.push({ field: 'name', message: 'Name is required' });
    if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
    if (input.email !== undefined && input.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) details.push({ field: 'email', message: 'Email format is invalid' });
    if (validate) details.push(...validate(input, 'create'));
    if (details.length) throw new ValidationError('Validation failed', details);

    if (!scopes.includes(Number(input.organizationId))) {
      throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
    }

    if (input.code?.trim()) {
      const [existing] = await getPool().query(`SELECT id FROM ${table} WHERE organization_id = ? AND code = ? LIMIT 1`, [Number(input.organizationId), input.code.trim()]);
      if (existing.length > 0) throw new AppError(`${noun} code already exists in this organization`, { statusCode: 409, code: `DUPLICATE_${key.toUpperCase()}_CODE` });
    }

    const insertCols = ['organization_id', 'code', 'name', ...extraFields.map((f) => f.column), 'status', 'notes'];
    const values = [
      Number(input.organizationId),
      input.code?.trim() || null,
      input.name.trim(),
      ...extraFields.map((f) => (f.coerce
        ? f.coerce(input[f.key])
        : (input[f.key] === '' || input[f.key] === undefined ? null : input[f.key]))),
      input.status || 'active',
      input.notes?.trim() || null,
    ];
    const [result] = await getPool().query(
      `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
      values,
    );
    return getById(result.insertId, userId);
  }

  async function update(id, input, userId) {
    const row = await getById(id, userId);
    const details = [];
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) details.push({ field: 'name', message: 'Name must not be empty' });
    if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
    if (input.email !== undefined && input.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) details.push({ field: 'email', message: 'Email format is invalid' });
    if (validate) details.push(...validate(input, 'update'));
    if (details.length) throw new ValidationError('Validation failed', details);

    if (input.code?.trim()) {
      const [existing] = await getPool().query(`SELECT id FROM ${table} WHERE organization_id = ? AND code = ? AND id <> ? LIMIT 1`, [row.organization_id, input.code.trim(), id]);
      if (existing.length > 0) throw new AppError(`${noun} code already exists in this organization`, { statusCode: 409, code: `DUPLICATE_${key.toUpperCase()}_CODE` });
    }

    const sets = [];
    const params = [];
    if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name.trim()); }
    if (input.code !== undefined) { sets.push('code = ?'); params.push(input.code?.trim() || null); }
    if (input.status !== undefined) { sets.push('status = ?'); params.push(input.status); }
    if (input.notes !== undefined) { sets.push('notes = ?'); params.push(input.notes?.trim() || null); }
    for (const f of extraFields) {
      if (input[f.key] !== undefined) {
        sets.push(`${f.column} = ?`);
        params.push(input[f.key] === '' || input[f.key] === null ? null : (f.coerce ? f.coerce(input[f.key]) : input[f.key]));
      }
    }
    if (sets.length > 0) {
      params.push(id);
      await getPool().query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, params);
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
        res.json({
          success: true,
          data: await list(req.user.id, {
            search: req.query.search,
            status: req.query.status,
            organizationId: req.query.organizationId,
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
          }),
        });
      } catch (err) { next(err); }
    });

    r.get(`/${routeKey}/:id`, requirePermission(`${permissionPrefix}.view`), async (req, res, next) => {
      try {
        res.json({ success: true, data: { [responseKey]: await getById(parseIdParam(req.params.id), req.user.id) } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}`, requirePermission(`${permissionPrefix}.create`), async (req, res, next) => {
      try {
        const row = await create(req.body ?? {}, req.user.id);
        res.status(201).json({ success: true, data: { [responseKey]: row } });
      } catch (err) { next(err); }
    });

    r.patch(`/${routeKey}/:id`, requirePermission(`${permissionPrefix}.update`), async (req, res, next) => {
      try {
        const row = await update(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
        res.json({ success: true, data: { [responseKey]: row } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}/:id/deactivate`, requirePermission(`${permissionPrefix}.deactivate`), async (req, res, next) => {
      try {
        const row = await deactivate(parseIdParam(req.params.id), req.user.id);
        res.json({ success: true, data: { [responseKey]: row } });
      } catch (err) { next(err); }
    });

    r.post(`/${routeKey}/:id/activate`, requirePermission(`${permissionPrefix}.update`), async (req, res, next) => {
      try {
        const row = await activate(parseIdParam(req.params.id), req.user.id);
        res.json({ success: true, data: { [responseKey]: row } });
      } catch (err) { next(err); }
    });

    return r;
  }

  return { list, getById, create, update, deactivate, activate, router };
}
