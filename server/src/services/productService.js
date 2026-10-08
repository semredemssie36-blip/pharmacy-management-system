import AppError from '../errors/AppError.js';
import ValidationError from '../errors/ValidationError.js';
import authorizationService from './authorizationService.js';
import productRepository from '../repositories/productRepository.js';
import { getPool } from '../database/pool.js';

const ENUM_CHECKS = {
  prescriptionClassification: ['prescription', 'otc'],
  controlledClassification: ['none', 'controlled', 'restricted'],
  antibioticClassification: ['none', 'antibiotic'],
  storageRequirement: ['normal', 'refrigerated', 'controlled'],
};

function checkEnums(input) {
  const details = [];
  for (const [key, allowed] of Object.entries(ENUM_CHECKS)) {
    if (input[key] !== undefined && !allowed.includes(input[key])) {
      details.push({ field: key, message: `Must be one of: ${allowed.join(', ')}` });
    }
  }
  return details;
}

function checkStockPolicy(input) {
  const details = [];
  const nums = ['minStockLevel', 'maxStockLevel', 'reorderLevel'];
  for (const key of nums) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '' && Number(input[key]) < 0) {
      details.push({ field: key, message: 'Must be non-negative' });
    }
  }
  if (details.length) return details;
  const min = input.minStockLevel !== undefined ? Number(input.minStockLevel) : undefined;
  const max = input.maxStockLevel !== undefined ? Number(input.maxStockLevel) : undefined;
  const reorder = input.reorderLevel !== undefined ? Number(input.reorderLevel) : undefined;
  if (min !== undefined && max !== undefined && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
    details.push({ field: 'minStockLevel', message: 'Minimum stock cannot exceed maximum stock' });
  }
  if (reorder !== undefined && min !== undefined && !Number.isNaN(reorder) && !Number.isNaN(min) && reorder > min) {
    details.push({ field: 'reorderLevel', message: 'Reorder level should not exceed the minimum stock level' });
  }
  return details;
}

/** Active scope orgs for the user — master entities are organization-level. */
async function scopeOrgIds(userId) {
  const scope = await authorizationService.getUserScope(userId);
  return [...scope.organizationIds];
}

async function requireOrgAccess(userId, organizationId) {
  const scope = await authorizationService.getUserScope(userId);
  if (!scope.organizationIds.has(Number(organizationId))) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }
}

function validateInput(input, { partial = false } = {}) {
  const details = [];
  if (!partial || input.organizationId !== undefined) {
    if (!Number.isInteger(Number(input.organizationId)) || Number(input.organizationId) <= 0) {
      details.push({ field: 'organizationId', message: 'A valid organizationId is required' });
    }
  }
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) details.push({ field: 'name', message: 'Name is required' });
  }
  if (!partial || input.code !== undefined) {
    if (typeof input.code !== 'string' || !/^[A-Za-z0-9_\-\.]{2,50}$/.test(input.code.trim())) {
      details.push({ field: 'code', message: 'Code is required (2-50 alphanumeric, dash, underscore, dot)' });
    }
  }
  if (!partial || input.prescriptionClassification !== undefined) {
    if (!['prescription', 'otc'].includes(input.prescriptionClassification)) {
      details.push({ field: 'prescriptionClassification', message: "Must be 'prescription' or 'otc'" });
    }
  }
  if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) {
    details.push({ field: 'status', message: "Status must be 'active' or 'inactive'" });
  }
  details.push(...checkEnums(input));
  details.push(...checkStockPolicy(input));
  if (details.length) throw new ValidationError('Validation failed', details);
}

/** Ensure all referenced master rows belong to the same organization and are active. */
async function validateMasterReferences(organizationId, input) {
  const references = [
    ['brandId', 'brands', 'Brand'],
    ['genericId', 'generics', 'Generic'],
    ['dosageFormId', 'dosage_forms', 'Dosage form'],
    ['routeId', 'routes', 'Route'],
    ['categoryId', 'categories', 'Category'],
    ['therapeuticCategoryId', 'therapeutic_categories', 'Therapeutic category'],
    ['manufacturerId', 'manufacturers', 'Manufacturer'],
  ];
  const details = [];
  for (const [key, table, noun] of references) {
    if (input[key] === undefined || input[key] === null || input[key] === '') continue;
    const [rows] = await getPool().query(`SELECT id, organization_id, status FROM ${table} WHERE id = ? LIMIT 1`, [Number(input[key])]);
    const row = rows[0];
    if (!row) {
      details.push({ field: key, message: `${noun} does not exist` });
    } else if (row.organization_id !== Number(organizationId)) {
      details.push({ field: key, message: `${noun} belongs to a different organization` });
    } else if (row.status !== 'active') {
      details.push({ field: key, message: `${noun} is inactive` });
    }
  }
  if (details.length) throw new ValidationError('Validation failed', details);
}

async function list(userId, filters) {
  const userScopeOrgIds = await scopeOrgIds(userId);
  const organizationScopeIds = filters.organizationId
    ? (userScopeOrgIds.includes(Number(filters.organizationId)) ? [Number(filters.organizationId)] : [])
    : userScopeOrgIds;
  const result = await productRepository.list({ ...filters, organizationScopeIds });
  return result;
}

async function getById(id, userId) {
  const product = await productRepository.findById(id);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  const scope = await authorizationService.getUserScope(userId);
  if (!scope.organizationIds.has(product.organization_id)) {
    throw new AppError('You do not have access to this scope.', { statusCode: 403, code: 'FORBIDDEN' });
  }
  const [ingredients, units, conversions, relationships] = await Promise.all([
    productRepository.getActiveIngredients(id),
    productRepository.getUnits(id),
    productRepository.getConversions(id),
    productRepository.getRelationships(id),
  ]);
  return { ...product, ingredients, units, conversions, relationships };
}

async function create(input, userId) {
  validateInput(input);
  await requireOrgAccess(userId, input.organizationId);
  await validateMasterReferences(input.organizationId, input);

  const existingCode = await productRepository.findByCode(input.organizationId, input.code.trim());
  if (existingCode) throw new AppError('Product code already exists in this organization', { statusCode: 409, code: 'DUPLICATE_PRODUCT_CODE' });
  if (input.barcode) {
    const existingBarcode = await productRepository.findByBarcode(input.organizationId, input.barcode.trim());
    if (existingBarcode) throw new AppError('Barcode already exists in this organization', { statusCode: 409, code: 'DUPLICATE_PRODUCT_BARCODE' });
  }

  return productRepository.create({
    organization_id: Number(input.organizationId),
    code: input.code.trim(),
    barcode: input.barcode?.trim() || null,
    name: input.name.trim(),
    description: input.description ?? null,
    brand_id: input.brandId || null,
    generic_id: input.genericId || null,
    dosage_form_id: input.dosageFormId || null,
    route_id: input.routeId || null,
    category_id: input.categoryId || null,
    therapeutic_category_id: input.therapeuticCategoryId || null,
    manufacturer_id: input.manufacturerId || null,
    registration_number: input.registrationNumber?.trim() || null,
    prescription_classification: input.prescriptionClassification,
    controlled_classification: input.controlledClassification || 'none',
    antibiotic_classification: input.antibioticClassification || 'none',
    storage_requirement: input.storageRequirement || 'normal',
    min_stock_level: input.minStockLevel ?? null,
    max_stock_level: input.maxStockLevel ?? null,
    reorder_level: input.reorderLevel ?? null,
    status: input.status || 'active',
  });
}

async function update(id, input, userId) {
  const product = await productRepository.findById(id);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  await requireOrgAccess(userId, product.organization_id);
  validateInput({ ...input, organizationId: product.organization_id }, { partial: true });
  await validateMasterReferences(product.organization_id, input);

  if (input.code && input.code.trim() !== product.code) {
    const existing = await productRepository.findByCode(product.organization_id, input.code.trim());
    if (existing && existing.id !== id) throw new AppError('Product code already exists in this organization', { statusCode: 409, code: 'DUPLICATE_PRODUCT_CODE' });
  }
  if (input.barcode && input.barcode.trim() !== product.barcode) {
    const existing = await productRepository.findByBarcode(product.organization_id, input.barcode.trim());
    if (existing && existing.id !== id) throw new AppError('Barcode already exists in this organization', { statusCode: 409, code: 'DUPLICATE_PRODUCT_BARCODE' });
  }

  return productRepository.update(id, input);
}

async function deactivate(id, userId) {
  await getById(id, userId);
  return productRepository.update(id, { status: 'inactive' });
}

async function activate(id, userId) {
  await getById(id, userId);
  return productRepository.update(id, { status: 'active' });
}

async function setActiveIngredients(productId, items, userId) {
  const product = await productRepository.findById(productId);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  await requireOrgAccess(userId, product.organization_id);
  if (!Array.isArray(items)) throw new ValidationError('Validation failed', [{ field: 'ingredients', message: 'Must be an array' }]);

  const details = [];
  const seen = new Set();
  for (const item of items) {
    if (!Number.isInteger(Number(item.activeIngredientId))) {
      details.push({ field: 'activeIngredientId', message: 'Invalid active ingredient id' });
      continue;
    }
    if (seen.has(Number(item.activeIngredientId))) {
      details.push({ field: 'activeIngredientId', message: 'Duplicate ingredient in the same product' });
    }
    seen.add(Number(item.activeIngredientId));
    const [rows] = await getPool().query('SELECT id, organization_id, status FROM active_ingredients WHERE id = ? LIMIT 1', [Number(item.activeIngredientId)]);
    const row = rows[0];
    if (!row) details.push({ field: 'activeIngredientId', message: 'Active ingredient does not exist' });
    else if (row.organization_id !== product.organization_id) details.push({ field: 'activeIngredientId', message: 'Active ingredient belongs to a different organization' });
    else if (row.status !== 'active') details.push({ field: 'activeIngredientId', message: 'Active ingredient is inactive' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);
  return productRepository.setActiveIngredients(productId, items.map((i) => ({ activeIngredientId: Number(i.activeIngredientId), strength: i.strength?.trim() || null })));
}

async function setUnits(productId, items, userId) {
  const product = await productRepository.findById(productId);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  await requireOrgAccess(userId, product.organization_id);
  if (!Array.isArray(items)) throw new ValidationError('Validation failed', [{ field: 'units', message: 'Must be an array' }]);

  const details = [];
  const seen = new Set();
  for (const item of items) {
    if (!Number.isInteger(Number(item.unitId))) {
      details.push({ field: 'unitId', message: 'Invalid unit id' });
      continue;
    }
    if (seen.has(Number(item.unitId))) details.push({ field: 'unitId', message: 'Duplicate unit' });
    seen.add(Number(item.unitId));
    const [rows] = await getPool().query('SELECT id, organization_id, status FROM units WHERE id = ? LIMIT 1', [Number(item.unitId)]);
    const row = rows[0];
    if (!row) details.push({ field: 'unitId', message: 'Unit does not exist' });
    else if (row.organization_id !== product.organization_id) details.push({ field: 'unitId', message: 'Unit belongs to a different organization' });
    else if (row.status !== 'active') details.push({ field: 'unitId', message: 'Unit is inactive' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);
  return productRepository.setUnits(productId, items.map((i) => ({
    unitId: Number(i.unitId),
    isBaseUnit: !!i.isBaseUnit,
    isPurchaseUnit: !!i.isPurchaseUnit,
    isInventoryUnit: !!i.isInventoryUnit,
    isSellingUnit: !!i.isSellingUnit,
  })));
}

async function setConversions(productId, items, userId) {
  const product = await productRepository.findById(productId);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  await requireOrgAccess(userId, product.organization_id);
  if (!Array.isArray(items)) throw new ValidationError('Validation failed', [{ field: 'conversions', message: 'Must be an array' }]);

  const details = [];
  const seen = new Set();
  for (const item of items) {
    if (!Number.isInteger(Number(item.fromUnitId)) || !Number.isInteger(Number(item.toUnitId))) {
      details.push({ field: 'fromUnitId/toUnitId', message: 'Invalid unit ids' });
      continue;
    }
    if (Number(item.fromUnitId) === Number(item.toUnitId)) {
      details.push({ field: 'fromUnitId', message: 'Conversion from a unit to itself is not allowed' });
    }
    if (!(Number(item.factor) > 0)) {
      details.push({ field: 'factor', message: 'Conversion factor must be positive' });
    }
    const key = `${item.fromUnitId}->${item.toUnitId}`;
    if (seen.has(key)) details.push({ field: 'fromUnitId/toUnitId', message: 'Duplicate conversion definition' });
    seen.add(key);
  }
  if (details.length) throw new ValidationError('Validation failed', details);
  return productRepository.setConversions(productId, items.map((i) => ({
    fromUnitId: Number(i.fromUnitId),
    toUnitId: Number(i.toUnitId),
    factor: Number(i.factor),
  })));
}

const RELATIONSHIP_TYPES = ['equivalent', 'alternative', 'different_strength', 'different_dosage_form'];

async function setRelationships(productId, items, userId) {
  const product = await productRepository.findById(productId);
  if (!product) throw new AppError('Product not found', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  await requireOrgAccess(userId, product.organization_id);
  if (!Array.isArray(items)) throw new ValidationError('Validation failed', [{ field: 'relationships', message: 'Must be an array' }]);

  const details = [];
  const seen = new Set();
  for (const item of items) {
    if (!Number.isInteger(Number(item.relatedProductId))) {
      details.push({ field: 'relatedProductId', message: 'Invalid related product id' });
      continue;
    }
    if (Number(item.relatedProductId) === productId) {
      details.push({ field: 'relatedProductId', message: 'A product cannot be related to itself' });
    }
    if (!RELATIONSHIP_TYPES.includes(item.relationshipType)) {
      details.push({ field: 'relationshipType', message: `Must be one of: ${RELATIONSHIP_TYPES.join(', ')}` });
    }
    const key = `${item.relatedProductId}:${item.relationshipType}`;
    if (seen.has(key)) details.push({ field: 'relationships', message: 'Duplicate relationship definition' });
    seen.add(key);

    const related = await productRepository.findById(Number(item.relatedProductId));
    if (!related) details.push({ field: 'relatedProductId', message: 'Related product does not exist' });
    else if (related.organization_id !== product.organization_id) details.push({ field: 'relatedProductId', message: 'Related product belongs to a different organization' });
  }
  if (details.length) throw new ValidationError('Validation failed', details);
  return productRepository.setRelationships(productId, items.map((i) => ({
    relatedProductId: Number(i.relatedProductId),
    relationshipType: i.relationshipType,
  })));
}

export default {
  list, getById, create, update, deactivate, activate,
  setActiveIngredients, setUnits, setConversions, setRelationships,
};
