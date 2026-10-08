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
