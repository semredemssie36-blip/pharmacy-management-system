/**
 * Task 21 — Reports and Dashboards Frontend API Client
 */
import apiClient from '../../services/apiClient.js';

function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      sp.set(key, val);
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const reportsApi = {
  getDashboard: (params) => apiClient.get(`/reports/dashboard${buildQuery(params)}`),
  getSales: (params) => apiClient.get(`/reports/sales${buildQuery(params)}`),
  getInventory: (params) => apiClient.get(`/reports/inventory${buildQuery(params)}`),
  getFinancial: (params) => apiClient.get(`/reports/financial${buildQuery(params)}`),
  getProcurement: (params) => apiClient.get(`/reports/procurement${buildQuery(params)}`),
  getDispensing: (params) => apiClient.get(`/reports/dispensing${buildQuery(params)}`),
  getExpiryQuarantine: (params) => apiClient.get(`/reports/expiry-quarantine${buildQuery(params)}`),
};

export default reportsApi;
