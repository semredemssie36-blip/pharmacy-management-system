import stockTransferService from '../services/stockTransferService.js';

export const stockTransferController = {
  async listTransfers(req, res, next) {
    try {
      const result = await stockTransferService.listTransfers(req.query, req.user);
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getTransfer(req, res, next) {
    try {
      const data = await stockTransferService.getTransfer(req.params.id, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async getEligibleStock(req, res, next) {
    try {
      const { warehouseId, productId } = req.query;
      const data = await stockTransferService.getEligibleStock(warehouseId, productId, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async createTransfer(req, res, next) {
    try {
      const data = await stockTransferService.createTransfer(req.body, req.user);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateTransfer(req, res, next) {
    try {
      const data = await stockTransferService.updateTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async submitTransfer(req, res, next) {
    try {
      const data = await stockTransferService.submitTransfer(req.params.id, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async approveTransfer(req, res, next) {
    try {
      const data = await stockTransferService.approveTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async rejectTransfer(req, res, next) {
    try {
      const data = await stockTransferService.rejectTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async dispatchTransfer(req, res, next) {
    try {
      const data = await stockTransferService.dispatchTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async receiveTransfer(req, res, next) {
    try {
      const data = await stockTransferService.receiveTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async resolveDiscrepancy(req, res, next) {
    try {
      const data = await stockTransferService.resolveDiscrepancy(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },

  async cancelTransfer(req, res, next) {
    try {
      const data = await stockTransferService.cancelTransfer(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default stockTransferController;
