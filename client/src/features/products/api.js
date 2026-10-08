import apiClient from '../../services/apiClient.js';

export const productsApi = {
  list: (params) => apiClient.get(`/products${params ? `?${new URLSearchParams(params)}` : ''}`),
  get: (id) => apiClient.get(`/products/${id}`),
  create: (data) => apiClient.post('/products', data),
  update: (id, data) => apiClient.patch(`/products/${id}`, data),
  deactivate: (id) => apiClient.post(`/products/${id}/deactivate`, {}),
  activate: (id) => apiClient.post(`/products/${id}/activate`, {}),
  setIngredients: (id, ingredients) => apiClient.put(`/products/${id}/active-ingredients`, { ingredients }),
  setUnits: (id, units) => apiClient.put(`/products/${id}/units`, { units }),
  setConversions: (id, conversions) => apiClient.put(`/products/${id}/unit-conversions`, { conversions }),
  setRelationships: (id, relationships) => apiClient.put(`/products/${id}/relationships`, { relationships }),
};
