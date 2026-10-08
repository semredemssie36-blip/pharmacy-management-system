import apiClient from '../../services/apiClient.js';

export const purchaseOrdersApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/purchase-orders${q}`);
  },
  get(id) { return apiClient.get(`/purchase-orders/${id}`); },
  create(data) { return apiClient.post('/purchase-orders', data); },
  update(id, data) { return apiClient.patch(`/purchase-orders/${id}`, data); },
  submit(id) { return apiClient.post(`/purchase-orders/${id}/submit`, {}); },
  approve(id) { return apiClient.post(`/purchase-orders/${id}/approve`, {}); },
  reject(id, reason) { return apiClient.post(`/purchase-orders/${id}/reject`, { reason }); },
  cancel(id, reason) { return apiClient.post(`/purchase-orders/${id}/cancel`, { reason }); },
};

export const goodsReceiptsApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/goods-receipts${q}`);
  },
  get(id) { return apiClient.get(`/goods-receipts/${id}`); },
  create(data) { return apiClient.post('/goods-receipts', data); },
  update(id, data) { return apiClient.patch(`/goods-receipts/${id}`, data); },
  start(id) { return apiClient.post(`/goods-receipts/${id}/start`, {}); },
  complete(id) { return apiClient.post(`/goods-receipts/${id}/complete`, {}); },
  cancel(id, data) { return apiClient.post(`/goods-receipts/${id}/cancel`, data || {}); },
  discrepancy(id, data) { return apiClient.post(`/goods-receipts/${id}/discrepancy`, data || {}); },
};
