import apiClient from '../../services/apiClient.js';

function buildCleanQuery(params) {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '' && val !== 'undefined') {
      sp.set(key, val);
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const paymentsApi = {
  list: (params) => apiClient.get(`/payments${buildCleanQuery(params)}`),
  get: (id) => apiClient.get(`/payments/${id}`),
  getReceipt: (id) => apiClient.get(`/payments/${id}/receipt`),
  create: (data) => apiClient.post('/payments', data),
  verify: (id, data = {}) => apiClient.post(`/payments/${id}/verify`, data),
  cancel: (id, data = {}) => apiClient.post(`/payments/${id}/cancel`, data),
  refund: (id, data) => apiClient.post(`/payments/${id}/refund`, data),
};

export const receivablesApi = {
  list: (params) => apiClient.get(`/receivables${buildCleanQuery(params)}`),
  get: (id) => apiClient.get(`/receivables/${id}`),
  getCustomerSummary: (customerId) => apiClient.get(`/customers/${customerId}/financial-summary`),
  creditSale: (data) => apiClient.post('/receivables/credit-sale', data),
  creditDispensing: (data) => apiClient.post('/receivables/credit-dispensing', data),
};
