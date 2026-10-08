import apiClient from '../../services/apiClient.js';

const makeResource = (resource) => ({
  list: () => apiClient.get(`/${resource}`),
  get: (id) => apiClient.get(`/${resource}/${id}`),
  create: (data) => apiClient.post(`/${resource}`, data),
  update: (id, data) => apiClient.patch(`/${resource}/${id}`, data),
  deactivate: (id) => apiClient.post(`/${resource}/${id}/deactivate`, {}),
  activate: (id) => apiClient.post(`/${resource}/${id}/activate`, {}),
});

export const usersApi = {
  ...makeResource('users'),
  setRoles: (id, roleIds) => apiClient.put(`/users/${id}/roles`, { roleIds }),
  setScopes: (id, scopes) => apiClient.put(`/users/${id}/scopes`, { scopes }),
};

export const rolesApi = {
  ...makeResource('roles'),
  setPermissions: (id, permissionIds) => apiClient.put(`/roles/${id}/permissions`, { permissionIds }),
};

export const permissionsApi = {
  list: (params) => apiClient.get(`/permissions${params ? `?${new URLSearchParams(params)}` : ''}`),
};
