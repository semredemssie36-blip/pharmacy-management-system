import saleService from '../services/saleService.js';
import { parseIdParam } from '../utils/parseId.js';

function cleanQueryParam(val) {
  if (val === undefined || val === null || val === '' || val === 'undefined' || val === 'null') {
    return undefined;
  }
  return val;
}

async function list(req, res, next) {
  try {
    const result = await saleService.listSales(req.user.id, {
      search: cleanQueryParam(req.query.search),
      status: cleanQueryParam(req.query.status),
      branchId: cleanQueryParam(req.query.branchId),
      warehouseId: cleanQueryParam(req.query.warehouseId),
      customerId: cleanQueryParam(req.query.customerId),
      startDate: cleanQueryParam(req.query.startDate),
      endDate: cleanQueryParam(req.query.endDate),
      page: cleanQueryParam(req.query.page),
      limit: cleanQueryParam(req.query.limit),
      sort: cleanQueryParam(req.query.sort),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const sale = await saleService.getSaleById(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function getReceipt(req, res, next) {
  try {
    const receipt = await saleService.getReceiptData(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { receipt } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const sale = await saleService.createSale(req.body ?? {}, req.user.id);
    res.status(201).json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const sale = await saleService.updateSale(parseIdParam(req.params.id), req.body ?? {}, req.user.id);
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function confirm(req, res, next) {
  try {
    const sale = await saleService.confirmSale(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function paymentPending(req, res, next) {
  try {
    const sale = await saleService.movePaymentPending(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const sale = await saleService.completeSale(parseIdParam(req.params.id), req.user.id);
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const sale = await saleService.cancelSale(
      parseIdParam(req.params.id),
      req.body?.cancelledReason || req.body?.reason,
      req.user.id,
    );
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function voidSale(req, res, next) {
  try {
    const sale = await saleService.voidSale(
      parseIdParam(req.params.id),
      req.body?.voidReason || req.body?.reason,
      req.user.id,
    );
    res.json({ success: true, data: { sale } });
  } catch (err) {
    next(err);
  }
}

async function searchPosProducts(req, res, next) {
  try {
    const products = await saleService.searchPosProducts(req.user.id, {
      q: req.query.q || req.query.search,
      branchId: req.query.branchId,
      warehouseId: req.query.warehouseId,
      organizationId: req.query.organizationId,
    });
    res.json({ success: true, data: { products } });
  } catch (err) {
    next(err);
  }
}

export default {
  list,
  getById,
  getReceipt,
  create,
  update,
  confirm,
  paymentPending,
  complete,
  cancel,
  voidSale,
  searchPosProducts,
};
