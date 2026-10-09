import apiClient from '../../services/apiClient.js';

export const inventoryApi = {
  list: (params) => apiClient.get(`/inventory${params ? `?${new URLSearchParams(params)}` : ''}`),
  get: (id) => apiClient.get(`/inventory/${id}`),
  createOpeningBalance: (data) => apiClient.post('/inventory/opening-balance', data),
};

export const batchesApi = {
  list: (params) => apiClient.get(`/batches${params ? `?${new URLSearchParams(params)}` : ''}`),
  get: (id) => apiClient.get(`/batches/${id}`),
};

export const stockMovementsApi = {
  list: (params) => apiClient.get(`/stock-movements${params ? `?${new URLSearchParams(params)}` : ''}`),
  get: (id) => apiClient.get(`/stock-movements/${id}`),
};

export const stockTransfersApi = {
  list: (params) => {
    const cleanParams = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = v;
        }
      });
    }
    const q = Object.keys(cleanParams).length > 0 ? `?${new URLSearchParams(cleanParams).toString()}` : '';
    return apiClient.get(`/stock-transfers${q}`);
  },
  get: (id) => apiClient.get(`/stock-transfers/${id}`),
  create: (data) => apiClient.post('/stock-transfers', data),
  submit: (id) => apiClient.post(`/stock-transfers/${id}/submit`),
  approve: (id, data) => apiClient.post(`/stock-transfers/${id}/approve`, data || {}),
  reject: (id, data) => apiClient.post(`/stock-transfers/${id}/reject`, data),
  cancel: (id, data) => apiClient.post(`/stock-transfers/${id}/cancel`, data || {}),
  dispatch: (id, data) => apiClient.post(`/stock-transfers/${id}/dispatch`, data),
  receive: (id, data) => apiClient.post(`/stock-transfers/${id}/receive`, data),
  resolveDiscrepancy: (id, data) => apiClient.post(`/stock-transfers/${id}/resolve-discrepancy`, data),
  getAvailableBatches: (id) => apiClient.get(`/stock-transfers/${id}/available-batches`),
};

export const stockCountsApi = {
  list: (params) => {
    const cleanParams = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = v;
        }
      });
    }
    const q = Object.keys(cleanParams).length > 0 ? `?${new URLSearchParams(cleanParams).toString()}` : '';
    return apiClient.get(`/stock-counts${q}`);
  },
  get: (id) => apiClient.get(`/stock-counts/${id}`),
  create: (data) => apiClient.post('/stock-counts', data),
  start: (id) => apiClient.post(`/stock-counts/${id}/start`),
  recordCount: (id, data) => apiClient.post(`/stock-counts/${id}/record-count`, data),
  recount: (id, data) => apiClient.post(`/stock-counts/${id}/recount`, data),
  submit: (id, data) => apiClient.post(`/stock-counts/${id}/submit`, data || {}),
  approve: (id, data) => apiClient.post(`/stock-counts/${id}/approve`, data || {}),
  reject: (id, data) => apiClient.post(`/stock-counts/${id}/reject`, data),
  apply: (id, data) => apiClient.post(`/stock-counts/${id}/apply`, data || {}),
  cancel: (id, data) => apiClient.post(`/stock-counts/${id}/cancel`, data || {}),
};

export default {
  inventoryApi,
  batchesApi,
  stockMovementsApi,
  stockTransfersApi,
  stockCountsApi,
};

