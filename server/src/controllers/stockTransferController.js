import stockTransferService from '../services/stockTransferService.js';

export const stockTransferController = {
  async listTransfers(req, res) {
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
  },

  async getTransfer(req, res) {
    const data = await stockTransferService.getTransfer(req.params.id, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async getEligibleStock(req, res) {
    const { warehouseId, productId } = req.query;
    const data = await stockTransferService.getEligibleStock(warehouseId, productId, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async createTransfer(req, res) {
    const data = await stockTransferService.createTransfer(req.body, req.user);
    res.status(201).json({
      success: true,
      data,
    });
  },

  async updateTransfer(req, res) {
    const data = await stockTransferService.updateTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async submitTransfer(req, res) {
    const data = await stockTransferService.submitTransfer(req.params.id, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async approveTransfer(req, res) {
    const data = await stockTransferService.approveTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async rejectTransfer(req, res) {
    const data = await stockTransferService.rejectTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async dispatchTransfer(req, res) {
    const data = await stockTransferService.dispatchTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async receiveTransfer(req, res) {
    const data = await stockTransferService.receiveTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async resolveDiscrepancy(req, res) {
    const data = await stockTransferService.resolveDiscrepancy(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },

  async cancelTransfer(req, res) {
    const data = await stockTransferService.cancelTransfer(req.params.id, req.body, req.user);
    res.json({
      success: true,
      data,
    });
  },
};

export default stockTransferController;
