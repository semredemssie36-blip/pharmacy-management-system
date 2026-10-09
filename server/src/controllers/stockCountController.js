import stockCountService from '../services/stockCountService.js';

export const stockCountController = {
  async listStockCounts(req, res, next) {
    try {
      const result = await stockCountService.listStockCounts(req.query, req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async getStockCount(req, res, next) {
    try {
      const count = await stockCountService.getStockCount(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async createStockCount(req, res, next) {
    try {
      const count = await stockCountService.createStockCount(req.body, req.user);
      return res.status(201).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async startStockCount(req, res, next) {
    try {
      const count = await stockCountService.startStockCount(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async recordCountLines(req, res, next) {
    try {
      const count = await stockCountService.recordCountLines(req.params.id, req.body, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async submitStockCount(req, res, next) {
    try {
      const count = await stockCountService.submitStockCount(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async requestRecount(req, res, next) {
    try {
      const count = await stockCountService.requestRecount(req.params.id, req.body, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async approveStockCount(req, res, next) {
    try {
      const count = await stockCountService.approveStockCount(req.params.id, req.body, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async rejectStockCount(req, res, next) {
    try {
      const count = await stockCountService.rejectStockCount(req.params.id, req.body, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async applyAdjustments(req, res, next) {
    try {
      const count = await stockCountService.applyAdjustments(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },

  async cancelStockCount(req, res, next) {
    try {
      const count = await stockCountService.cancelStockCount(req.params.id, req.body, req.user);
      return res.status(200).json({
        success: true,
        data: count,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default stockCountController;
