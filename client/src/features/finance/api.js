import apiClient from '../../services/apiClient.js';

export const paymentsApi = {
  list: (params) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient.get(`/payments${q}`);
  },
  get: (id) => apiClient.get(`/payments/${id}`),
  getReceipt: (id) => apiClient.get(`/payments/${id}/receipt`),
  create: (data) => apiClient.post('/payments', data),
  verify: (id, data = {}) => apiClient.post(`/payments/${id}/verify`, data),
  cancel: (id, data = {}) => apiClient.post(`/payments/${id}/cancel`, data),
  refund: (id, data) => apiClient.post(`/payments/${id}/refund`, data),
};

export const receivablesApi = {
  list: (params) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient.get(`/receivables${q}`);
  },
  get: (id) => apiClient.get(`/receivables/${id}`),
  getCustomerSummary: (customerId) => apiClient.get(`/customers/${customerId}/financial-summary`),
  creditSale: (data) => apiClient.post('/receivables/credit-sale', data),
  creditDispensing: (data) => apiClient.post('/receivables/credit-dispensing', data),
};
