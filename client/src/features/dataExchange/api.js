import apiClient from '../../services/apiClient.js';

export async function globalSearch(q, type = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  const res = await apiClient.get(`/search?${params.toString()}`);
  return res.data;
}

export async function downloadImportTemplate(type) {
  // Direct file download using fetch
  const res = await fetch(`/api/v1/import/templates/${type}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Failed to download template');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}_template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function previewImport(type, csvData, updateExisting = false) {
  const res = await apiClient.post(`/import/preview/${type}`, {
    csvData,
    updateExisting,
  });
  return res.data;
}

export async function commitImport(type, csvData, filename = '', updateExisting = false) {
  const res = await apiClient.post(`/import/commit/${type}`, {
    csvData,
    filename,
    updateExisting,
  });
  return res.data;
}

export async function getImportJobs(page = 1, limit = 10) {
  const res = await apiClient.get(`/import/jobs?page=${page}&limit=${limit}`);
  return res.data;
}

export async function exportCsv(type, filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, v);
    }
  });

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const url = `/api/v1/export/${type}${queryStr}`;

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.message || `Export failed with status ${res.status}`);
  }

  // Get filename from header or fallback
  const disposition = res.headers.get('Content-Disposition');
  let filename = `export_${type}_${Date.now()}.csv`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}
