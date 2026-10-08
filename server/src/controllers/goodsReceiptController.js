import goodsReceiptService from '../services/goodsReceiptService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    res.json({
      success: true,
      data: await goodsReceiptService.list(req.user.id, {
        search: req.query.search,
        status: req.query.status,
        branchId: req.query.branchId,
        warehouseId: req.query.warehouseId,
        purchaseOrderId: req.query.purchaseOrderId,
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
      }),
    });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const receipt = await goodsReceiptService.getById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const receipt = await goodsReceiptService.create({ ...req.body, lines: req.body?.lines }, req.user.id);
    res.status(201).json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const receipt = await goodsReceiptService.updateDraft(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function start(req, res, next) {
  try {
    const receipt = await goodsReceiptService.start(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function complete(req, res, next) {
  try {
    const receipt = await goodsReceiptService.complete(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const receipt = await goodsReceiptService.cancel(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

async function discrepancy(req, res, next) {
  try {
    const receipt = await goodsReceiptService.markDiscrepancy(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { goodsReceipt: receipt } });
  } catch (err) { next(err); }
}

export default { list, getById, create, update, start, complete, cancel, discrepancy };
