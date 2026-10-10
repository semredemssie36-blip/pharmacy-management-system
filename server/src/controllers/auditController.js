/**
 * Task 19 — Centralized Audit Trail and Activity History Controller
 * Architecture: Route -> Controller -> Service -> Repository -> Database Pool
 */
import auditService from '../services/auditService.js';
import { parseIdParam } from '../utils/parseId.js';

export async function listLogs(req, res, next) {
  try {
    const result = await auditService.listLogs(req.query, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getLogById(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    const result = await auditService.getLogById(id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSummaryStats(req, res, next) {
  try {
    const result = await auditService.getSummaryStats(req.query, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function exportLogs(req, res, next) {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const result = await auditService.exportLogs({ ...req.query, format }, req.user);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
      return res.send(result);
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export default {
  listLogs,
  getLogById,
  getSummaryStats,
  exportLogs,
};
