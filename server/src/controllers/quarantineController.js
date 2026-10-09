import quarantineService from '../services/quarantineService.js';

export class QuarantineController {
  async list(req, res, next) {
    try {
      const result = await quarantineService.listQuarantines(req.query, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const qCase = await quarantineService.getQuarantineById(req.params.id, req.user.id);
      res.json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const qCase = await quarantineService.createQuarantine(req.body, req.user.id);
      res.status(201).json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }

  async review(req, res, next) {
    try {
      const qCase = await quarantineService.reviewQuarantine(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }

  async release(req, res, next) {
    try {
      const qCase = await quarantineService.releaseQuarantine(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }

  async dispose(req, res, next) {
    try {
      const qCase = await quarantineService.disposeQuarantine(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const qCase = await quarantineService.cancelQuarantine(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: qCase });
    } catch (err) {
      next(err);
    }
  }
}

export default new QuarantineController();
