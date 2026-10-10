import exportService from '../services/exportService.js';

class ExportController {
  async exportCsv(req, res, next) {
    try {
      const { type } = req.params;
      const { filename, csv } = await exportService.exportData({
        user: req.user,
        type,
        filters: req.query,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }
}

export default new ExportController();
