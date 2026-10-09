import supplierReturnService from '../services/supplierReturnService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await supplierReturnService.listReturns(
      {
        search: req.query.search,
        status: req.query.status,
        branchId: req.query.branchId,
        supplierId: req.query.supplierId,
        goodsReceiptId: req.query.goodsReceiptId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        page: req.query.page,
        limit: req.query.limit,
      },
      req.user.id,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.getReturnById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function getReceiptEligibility(req, res, next) {
  try {
    const data = await supplierReturnService.getReceiptEligibility(parseIdParam(req.params.receiptId), req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.createReturn(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.submitReturn(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.approveReturn(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.completeReturn(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const returnRecord = await supplierReturnService.cancelReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { supplierReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getReceiptEligibility,
  create,
  submit,
  approve,
  complete,
  cancel,
};
