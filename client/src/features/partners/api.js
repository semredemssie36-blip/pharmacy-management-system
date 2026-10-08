import apiClient from '../../services/apiClient.js';

/** Organization-level supplier/customer resources. */
export function partnerResourceApi({ routePath, responseKey }) {
  return {
    list: async (params) => {
      const query = params ? `?${new URLSearchParams(params)}` : '';
      const res = await apiClient.get(`/${routePath}${query}`);
      return { data: { items: res.data.items ?? [], total: res.data.total ?? 0 } };
    },
    get: (id) => apiClient.get(`/${routePath}/${id}`),
    create: (data) => apiClient.post(`/${routePath}`, data),
    update: (id, data) => apiClient.patch(`/${routePath}/${id}`, data),
    deactivate: (id) => apiClient.post(`/${routePath}/${id}/deactivate`, {}),
    reactivate: (id) => apiClient.post(`/${routePath}/${id}/activate`, {}),
  };
}

export const suppliersApi = partnerResourceApi({ routePath: 'suppliers', responseKey: 'supplier' });
export const customersApi = partnerResourceApi({ routePath: 'customers', responseKey: 'customer' });
