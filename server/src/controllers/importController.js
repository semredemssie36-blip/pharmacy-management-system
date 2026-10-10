import importService from '../services/importService.js';
import { parseIdParam } from '../utils/parseId.js';

class ImportController {
  getTemplate(req, res, next) {
    try {
      const { type } = req.params;
      const csv = importService.getTemplate(type);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_template.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  async preview(req, res, next) {
    try {
      const { type } = req.params;
      const csvString = typeof req.body === 'string'
        ? req.body
        : req.body?.csvData || req.body?.csvString || '';
      const updateExisting = Boolean(req.body?.updateExisting);

      const preview = await importService.validateAndPreview({
        user: req.user,
        type,
        csvString,
        updateExisting,
      });

      res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (err) {
      next(err);
    }
  }

  async commit(req, res, next) {
    try {
      const { type } = req.params;
      const csvString = typeof req.body === 'string'
        ? req.body
        : req.body?.csvData || req.body?.csvString || '';
      const filename = req.body?.filename || `${type}_import.csv`;
      const updateExisting = Boolean(req.body?.updateExisting);

      const result = await importService.commitImport({
        user: req.user,
        type,
        csvString,
        filename,
        updateExisting,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async listJobs(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await importService.listJobs({
        user: req.user,
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getJob(req, res, next) {
    try {
      const id = parseIdParam(req.params.id, 'job');
      const data = await importService.getJobById({
        user: req.user,
        id,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new ImportController();
