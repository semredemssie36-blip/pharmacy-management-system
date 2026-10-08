/**
 * Health service: reports whether the backend is running and how long
 * it has been up. Does not expose secrets.
 */
function getHealth() {
  return {
    status: 'ok',
    service: 'pharmacy-erp-server',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export default { getHealth };
