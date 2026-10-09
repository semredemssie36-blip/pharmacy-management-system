import expiryService from '../services/expiryService.js';

export class ExpiryController {
  async getSummary(req, res, next) {
    try {
      const summary = await expiryService.getSummary(req.user.id);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }

  async listBatches(req, res, next) {
    try {
      const result = await expiryService.listBatches(req.query, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async segregateExpired(req, res, next) {
    try {
      const result = await expiryService.segregateExpiredStock(req.body, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export default new ExpiryController();
