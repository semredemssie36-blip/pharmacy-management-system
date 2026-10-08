import apiClient from '../../services/apiClient.js';

function list(resource, params) {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  return apiClient.get(`/${resource}${query}`);
}

const makeResource = (resource) => ({
  list: (params) => list(resource, params),
  create: (data) => apiClient.post(`/${resource}`, data),
  update: (id, data) => apiClient.patch(`/${resource}/${id}`, data),
  deactivate: (id) => apiClient.post(`/${resource}/${id}/deactivate`, {}),
  reactivate: (id) => apiClient.patch(`/${resource}/${id}`, { status: 'active' }),
});

export const organizationsApi = makeResource('organizations');
export const branchesApi = makeResource('branches');
export const warehousesApi = makeResource('warehouses');
export const storageLocationsApi = makeResource('storage-locations');
