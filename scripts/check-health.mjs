/**
 * Simple health check against the backend API.
 * Usage: npm run health   (backend must be running)
 */
const baseUrl = process.env.API_URL || 'http://localhost:5000';

try {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error(`Health check failed: ${err.message}`);
  process.exit(1);
}
