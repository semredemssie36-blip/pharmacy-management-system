import apiClient from '../../services/apiClient.js';

export function login(email, password) {
  return apiClient.post('/auth/login', { email, password });
}

export function logout() {
  return apiClient.post('/auth/logout', {});
}

export function getCurrentUser() {
  return apiClient.get('/auth/me');
}

export function updateProfile(data) {
  return apiClient.put('/auth/profile', data);
}

export function changePassword(data) {
  return apiClient.post('/auth/change-password', data);
}
