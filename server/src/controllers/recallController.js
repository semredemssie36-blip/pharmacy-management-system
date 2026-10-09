import recallService from '../services/recallService.js';

export class RecallController {
  async list(req, res, next) {
    try {
      const result = await recallService.listRecalls(req.query, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const recall = await recallService.getRecallById(req.params.id, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const recall = await recallService.createRecall(req.body, req.user.id);
      res.status(201).json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async approve(req, res, next) {
    try {
      const recall = await recallService.approveRecall(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async activate(req, res, next) {
    try {
      const recall = await recallService.activateRecall(req.params.id, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async recordAction(req, res, next) {
    try {
      const recall = await recallService.recordAction(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async close(req, res, next) {
    try {
      const recall = await recallService.closeRecall(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const recall = await recallService.cancelRecall(req.params.id, req.body, req.user.id);
      res.json({ success: true, data: recall });
    } catch (err) {
      next(err);
    }
  }
}

export default new RecallController();
