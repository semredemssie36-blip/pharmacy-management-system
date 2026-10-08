import apiClient from '../../services/apiClient.js';

/**
 * Adapts the masterData CRUD resources (brands, units, …) to the shared
 * admin-directory shape used by AdminDirectoryPage.
 */
export function masterResourceApi(routePath, responseKey) {
  return {
    list: async (params) => {
      const query = params ? `?${new URLSearchParams(params)}` : '';
      const res = await apiClient.get(`/${routePath}${query}`);
      // AdminDirectoryPage expects data[itemListKey]; masters list returns {items,total,...}
      return { data: { items: res.data.items ?? [] } };
    },
    create: (data) => apiClient.post(`/${routePath}`, data),
    update: (id, data) => apiClient.patch(`/${routePath}/${id}`, data),
    deactivate: (id) => apiClient.post(`/${routePath}/${id}/deactivate`, {}),
    reactivate: (id) => apiClient.post(`/${routePath}/${id}/activate`, {}),
  };
}
