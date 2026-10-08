import apiClient from '../../services/apiClient.js';

/** System/backend status API calls for the foundation health check. */
export function getHealth() {
  return apiClient.get('/health');
}
