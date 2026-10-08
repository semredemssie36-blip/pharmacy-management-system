import dispensingService from '../services/dispensingService.js';

export const dispensingController = {
  async listDispensings(req, res, next) {
    try {
      const result = await dispensingService.listDispensings(req.query, req.user.id);
      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  },

  async getDispensingById(req, res, next) {
    try {
      const dispensing = await dispensingService.getDispensingById(req.params.id, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async createDispensing(req, res, next) {
    try {
      const dispensing = await dispensingService.createDispensing(req.body, req.user.id);
      return res.status(201).json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async allocateStock(req, res, next) {
    try {
      const dispensing = await dispensingService.allocateStock(req.params.id, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async submitForVerification(req, res, next) {
    try {
      const dispensing = await dispensingService.submitForVerification(req.params.id, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async verifyDispensing(req, res, next) {
    try {
      const dispensing = await dispensingService.verifyDispensing(req.params.id, req.body, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async rejectDispensing(req, res, next) {
    try {
      const dispensing = await dispensingService.rejectDispensing(req.params.id, req.body, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },

  async cancelDispensing(req, res, next) {
    try {
      const dispensing = await dispensingService.cancelDispensing(req.params.id, req.body, req.user.id);
      return res.json({
        success: true,
        data: { dispensing },
      });
    } catch (err) {
      return next(err);
    }
  },
};

export default dispensingController;
