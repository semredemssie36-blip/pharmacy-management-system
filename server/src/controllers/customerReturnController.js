import customerReturnService from '../services/customerReturnService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await customerReturnService.listReturns(
      {
        search: req.query.search,
        status: req.query.status,
        branchId: req.query.branchId,
        customerId: req.query.customerId,
        saleId: req.query.saleId,
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
    const returnRecord = await customerReturnService.getReturnById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function getSaleEligibility(req, res, next) {
  try {
    const data = await customerReturnService.getSaleEligibility(parseIdParam(req.params.saleId), req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const returnRecord = await customerReturnService.createReturn(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const returnRecord = await customerReturnService.submitReturn(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function inspect(req, res, next) {
  try {
    const returnRecord = await customerReturnService.inspectReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const returnRecord = await customerReturnService.approveReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const returnRecord = await customerReturnService.rejectReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const returnRecord = await customerReturnService.completeReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const returnRecord = await customerReturnService.cancelReturn(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { customerReturn: returnRecord } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getSaleEligibility,
  create,
  submit,
  inspect,
  approve,
  reject,
  complete,
  cancel,
};
