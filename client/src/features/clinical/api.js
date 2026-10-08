import apiClient from '../../services/apiClient.js';

export const patientsApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/patients${q}`);
  },
  get(id) {
    return apiClient.get(`/patients/${id}`);
  },
  checkDuplicates(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/patients/duplicates${q}`);
  },
  create(data) {
    return apiClient.post('/patients', data);
  },
  update(id, data) {
    return apiClient.put(`/patients/${id}`, data);
  },
  updateStatus(id, status) {
    return apiClient.patch(`/patients/${id}/status`, { status });
  },
};

export const prescribersApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/prescribers${q}`);
  },
  get(id) {
    return apiClient.get(`/prescribers/${id}`);
  },
  create(data) {
    return apiClient.post('/prescribers', data);
  },
  update(id, data) {
    return apiClient.put(`/prescribers/${id}`, data);
  },
  updateStatus(id, status) {
    return apiClient.patch(`/prescribers/${id}/status`, { status });
  },
};

export const prescriptionsApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/prescriptions${q}`);
  },
  get(id) {
    return apiClient.get(`/prescriptions/${id}`);
  },
  create(data) {
    return apiClient.post('/prescriptions', data);
  },
  update(id, data) {
    return apiClient.put(`/prescriptions/${id}`, data);
  },
  submit(id) {
    return apiClient.post(`/prescriptions/${id}/submit`, {});
  },
  validate(id, data = {}) {
    return apiClient.post(`/prescriptions/${id}/validate`, data);
  },
  cancel(id, data = {}) {
    return apiClient.post(`/prescriptions/${id}/cancel`, data);
  },
};

export const dispensingsApi = {
  list(params) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiClient.get(`/dispensings${q}`);
  },
  get(id) {
    return apiClient.get(`/dispensings/${id}`);
  },
  create(data) {
    return apiClient.post('/dispensings', data);
  },
  allocate(id) {
    return apiClient.post(`/dispensings/${id}/allocate`, {});
  },
  submitVerification(id) {
    return apiClient.post(`/dispensings/${id}/submit-verification`, {});
  },
  verify(id, data = {}) {
    return apiClient.post(`/dispensings/${id}/verify`, data);
  },
  reject(id, data = {}) {
    return apiClient.post(`/dispensings/${id}/reject`, data);
  },
  cancel(id, data = {}) {
    return apiClient.post(`/dispensings/${id}/cancel`, data);
  },
};

export default {
  patients: patientsApi,
  prescribers: prescribersApi,
  prescriptions: prescriptionsApi,
  dispensings: dispensingsApi,
};
