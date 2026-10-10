import apiClient from '../../services/apiClient.js';

export const auditApi = {
  list: (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''),
    );
    const qs = new URLSearchParams(cleanParams).toString();
    return apiClient.get(`/audit-logs${qs ? `?${qs}` : ''}`);
  },

  get: (id) => apiClient.get(`/audit-logs/${id}`),

  getStats: (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''),
    );
    const qs = new URLSearchParams(cleanParams).toString();
    return apiClient.get(`/audit-logs/stats${qs ? `?${qs}` : ''}`);
  },

  exportCsv: async (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries({ ...params, format: 'csv' }).filter(([_, v]) => v !== undefined && v !== null && v !== ''),
    );
    const qs = new URLSearchParams(cleanParams).toString();
    const url = `/api/v1/audit-logs/export${qs ? `?${qs}` : ''}`;
    
    // Trigger browser download
    const response = await fetch(url, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Export failed');
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};

export default auditApi;
