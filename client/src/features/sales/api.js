import apiClient from '../../services/apiClient.js';

function buildQuery(params) {
  if (!params) return '';
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== 'undefined' && value !== 'null') {
      clean[key] = value;
    }
  }
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : '';
}

export const salesApi = {
  list(params) {
    return apiClient.get(`/sales${buildQuery(params)}`);
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
    return apiClient.get(`/pos/products/search${buildQuery(params)}`);
  },
};

export default salesApi;
