import productService from '../services/productService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({
      success: true,
      data: await productService.list(req.user.id, {
        search: req.query.search,
        status: req.query.status,
        brandId: req.query.brandId,
        genericId: req.query.genericId,
        categoryId: req.query.categoryId,
        dosageFormId: req.query.dosageFormId,
        routeId: req.query.routeId,
        prescriptionClassification: req.query.prescriptionClassification,
        controlledClassification: req.query.controlledClassification,
        antibioticClassification: req.query.antibioticClassification,
        organizationId: req.query.organizationId,
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
      }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    res.json({ success: true, data: { product: await productService.getById(parseIdParam(req.params.id), req.user.id) } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const product = await productService.create(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { product } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const product = await productService.update(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { product } });
  } catch (err) { next(err); }
}

async function deactivate(req, res, next) {
  try {
    const product = await productService.deactivate(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { product } });
  } catch (err) { next(err); }
}

async function activate(req, res, next) {
  try {
    const product = await productService.activate(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { product } });
  } catch (err) { next(err); }
}

async function setActiveIngredients(req, res, next) {
  try {
    const ingredients = await productService.setActiveIngredients(parseIdParam(req.params.id), req.body?.ingredients, req.user.id);
    res.json({ success: true, data: { ingredients } });
  } catch (err) { next(err); }
}

async function setUnits(req, res, next) {
  try {
    const units = await productService.setUnits(parseIdParam(req.params.id), req.body?.units, req.user.id);
    res.json({ success: true, data: { units } });
  } catch (err) { next(err); }
}

async function setConversions(req, res, next) {
  try {
    const conversions = await productService.setConversions(parseIdParam(req.params.id), req.body?.conversions, req.user.id);
    res.json({ success: true, data: { conversions } });
  } catch (err) { next(err); }
}

async function setRelationships(req, res, next) {
  try {
    const relationships = await productService.setRelationships(parseIdParam(req.params.id), req.body?.relationships, req.user.id);
    res.json({ success: true, data: { relationships } });
  } catch (err) { next(err); }
}

export default {
  list, getById, create, update, deactivate, activate,
  setActiveIngredients, setUnits, setConversions, setRelationships,
};
