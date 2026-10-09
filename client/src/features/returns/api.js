import apiClient from '../../services/apiClient.js';

export const customerReturnsApi = {
  list: (params) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient.get(`/customer-returns${q}`);
  },
  get: (id) => apiClient.get(`/customer-returns/${id}`),
  getSaleEligibility: (saleId) => apiClient.get(`/customer-returns/sale-eligibility/${saleId}`),
  create: (data) => apiClient.post('/customer-returns', data),
  submit: (id) => apiClient.post(`/customer-returns/${id}/submit`),
  inspect: (id, data) => apiClient.post(`/customer-returns/${id}/inspect`, data),
  approve: (id, data) => apiClient.post(`/customer-returns/${id}/approve`, data),
  reject: (id, data) => apiClient.post(`/customer-returns/${id}/reject`, data),
  complete: (id) => apiClient.post(`/customer-returns/${id}/complete`),
  cancel: (id, data) => apiClient.post(`/customer-returns/${id}/cancel`, data),
};

export const supplierReturnsApi = {
  list: (params) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient.get(`/supplier-returns${q}`);
  },
  get: (id) => apiClient.get(`/supplier-returns/${id}`),
  getReceiptEligibility: (receiptId) => apiClient.get(`/supplier-returns/receipt-eligibility/${receiptId}`),
  create: (data) => apiClient.post('/supplier-returns', data),
  submit: (id) => apiClient.post(`/supplier-returns/${id}/submit`),
  approve: (id) => apiClient.post(`/supplier-returns/${id}/approve`),
  complete: (id) => apiClient.post(`/supplier-returns/${id}/complete`),
  cancel: (id, data) => apiClient.post(`/supplier-returns/${id}/cancel`, data),
};

export default { customerReturnsApi, supplierReturnsApi };
