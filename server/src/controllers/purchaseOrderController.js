import purchaseOrderService from '../procurement/purchaseOrderService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({
      success: true,
      data: await purchaseOrderService.list(req.user.id, {
        search: req.query.search,
        status: req.query.status,
        supplierId: req.query.supplierId,
        branchId: req.query.branchId,
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
      }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const po = await purchaseOrderService.getById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const body = req.body ?? {};
    const po = await purchaseOrderService.create(body, body.lines, req.user.id);
    res.status(201).json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function updateDraft(req, res, next) {
  try {
    const body = req.body ?? {};
    const po = await purchaseOrderService.updateDraft(parseIdParam(req.params.id), body, req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function submit(req, res, next) {
  try {
    const po = await purchaseOrderService.submit(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const po = await purchaseOrderService.approve(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const po = await purchaseOrderService.reject(parseIdParam(req.params.id), req.body?.reason, req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const po = await purchaseOrderService.cancel(parseIdParam(req.params.id), req.body?.reason, req.user.id);
    res.json({ success: true, data: { purchaseOrder: po } });
  } catch (err) { next(err); }
}

export default { list, getById, create, updateDraft, submit, approve, reject, cancel };
