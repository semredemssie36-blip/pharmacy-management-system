import receivableService from '../services/receivableService.js';
import { parseIdParam } from '../utils/parseId.js';

async function list(req, res, next) {
  try {
    const result = await receivableService.listReceivables(
      {
        search: req.query.search,
        status: req.query.status,
        branchId: req.query.branchId,
        customerId: req.query.customerId,
        overdueOnly: req.query.overdueOnly === 'true' || req.query.overdueOnly === true,
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
    const receivable = await receivableService.getReceivableById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { receivable } });
  } catch (err) {
    next(err);
  }
}

async function getCustomerFinancialSummary(req, res, next) {
  try {
    const result = await receivableService.getCustomerFinancialSummary(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function createCreditSale(req, res, next) {
  try {
    const result = await receivableService.authorizeCreditSale(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function createCreditDispensing(req, res, next) {
  try {
    const result = await receivableService.authorizeCreditDispensing(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getCustomerFinancialSummary,
  createCreditSale,
  createCreditDispensing,
};
