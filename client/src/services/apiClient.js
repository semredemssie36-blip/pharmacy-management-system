import { API_BASE_URL } from '../utils/env.js';

function sanitizePath(path) {
  if (!path || typeof path !== 'string' || !path.includes('?')) return path;
  const [baseUrl, query] = path.split('?');
  if (!query) return baseUrl;
  const sp = new URLSearchParams(query);
  const clean = new URLSearchParams();
  for (const [key, val] of sp.entries()) {
    if (val !== undefined && val !== null && val !== '' && val !== 'undefined' && val !== 'null') {
      clean.append(key, val);
    }
  }
  const cleanQuery = clean.toString();
  return cleanQuery ? `${baseUrl}?${cleanQuery}` : baseUrl;
}

/**
 * Reusable API client foundation.
 * All backend communication should go through this client — never
 * hardcode fetch() calls inside components.
 */
async function request(path, options = {}) {
  const sanitizedPath = sanitizePath(path);
  const response = await fetch(`${API_BASE_URL}${sanitizedPath}`, {
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
