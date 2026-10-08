import { API_BASE_URL } from '../utils/env.js';

/**
 * Reusable API client foundation.
 * All backend communication should go through this client — never
 * hardcode fetch() calls inside components.
 */
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include', // send the httpOnly auth cookie with API requests
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON response
  }

  if (!response.ok) {
    const message = body?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, data, options) =>
    request(path, { ...options, method: 'POST', body: JSON.stringify(data) }),
  put: (path, data, options) =>
    request(path, { ...options, method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data, options) =>
    request(path, { ...options, method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

export default apiClient;
