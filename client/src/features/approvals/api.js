import apiClient from '../../services/apiClient.js';

export const approvalsApi = {
  list: (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''),
    );
    const qs = new URLSearchParams(cleanParams).toString();
    return apiClient.get(`/approvals${qs ? `?${qs}` : ''}`);
  },
  get: (id) => apiClient.get(`/approvals/${id}`),
  create: (data) => apiClient.post('/approvals', data),
  approve: (id, data = {}) => apiClient.post(`/approvals/${id}/approve`, data),
  reject: (id, data) => apiClient.post(`/approvals/${id}/reject`, data),
  cancel: (id, data = {}) => apiClient.post(`/approvals/${id}/cancel`, data),
  listPolicies: () => apiClient.get('/approvals/policies'),
  upsertPolicy: (data) => apiClient.post('/approvals/policies', data),
};

export default approvalsApi;
