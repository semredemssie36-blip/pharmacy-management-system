import apiClient from '../../services/apiClient.js';

export const salesApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/sales${q}`);
  },
  get(id) {
    return apiClient.get(`/sales/${id}`);
  },
  getReceipt(id) {
    return apiClient.get(`/sales/${id}/receipt`);
  },
  create(data) {
    return apiClient.post('/sales', data);
  },
  update(id, data) {
    return apiClient.patch(`/sales/${id}`, data);
  },
  confirm(id) {
    return apiClient.post(`/sales/${id}/confirm`, {});
  },
  paymentPending(id) {
    return apiClient.post(`/sales/${id}/payment-pending`, {});
  },
  complete(id) {
    return apiClient.post(`/sales/${id}/complete`, {});
  },
  cancel(id, reason) {
    return apiClient.post(`/sales/${id}/cancel`, { reason });
  },
  voidSale(id, reason) {
    return apiClient.post(`/sales/${id}/void`, { reason });
  },
  searchPosProducts(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/pos/products/search${q}`);
  },
};

export default salesApi;
