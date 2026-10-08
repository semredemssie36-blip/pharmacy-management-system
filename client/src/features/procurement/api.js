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
