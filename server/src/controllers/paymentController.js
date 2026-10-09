import paymentService from '../services/paymentService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await paymentService.listPayments(
      {
        search: req.query.search,
        status: req.query.status,
        paymentMethod: req.query.paymentMethod,
        branchId: req.query.branchId,
        customerId: req.query.customerId,
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
    const payment = await paymentService.getPaymentById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function getReceipt(req, res, next) {
  try {
    const receipt = await paymentService.getPaymentReceipt(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { receipt } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const payment = await paymentService.createPayment(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const payment = await paymentService.verifyPayment(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const payment = await paymentService.cancelPayment(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function refund(req, res, next) {
  try {
    const result = await paymentService.refundPayment(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getReceipt,
  create,
  verify,
  cancel,
  refund,
};
