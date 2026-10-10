/**
 * Task 21 — Reports and Dashboards Controller
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import reportService from '../services/reportService.js';

export async function getDashboardSummary(req, res, next) {
  try {
    const data = await reportService.getDashboardSummary(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSalesReport(req, res, next) {
  try {
    const data = await reportService.getSalesReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getInventoryReport(req, res, next) {
  try {
    const data = await reportService.getInventoryReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getFinancialReport(req, res, next) {
  try {
    const data = await reportService.getFinancialReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getProcurementReport(req, res, next) {
  try {
    const data = await reportService.getProcurementReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getDispensingReport(req, res, next) {
  try {
    const data = await reportService.getDispensingReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getExpiryQuarantineReport(req, res, next) {
  try {
    const data = await reportService.getExpiryQuarantineReport(req.query, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export default {
  getDashboardSummary,
  getSalesReport,
  getInventoryReport,
  getFinancialReport,
  getProcurementReport,
  getDispensingReport,
  getExpiryQuarantineReport,
};
