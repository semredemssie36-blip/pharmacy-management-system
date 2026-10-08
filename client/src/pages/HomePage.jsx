import useHealthStatus from '../hooks/useHealthStatus.js';

/** Home/system page — confirms the frontend is running and reaches the API. */
function HomePage() {
  const { loading, health, error } = useHealthStatus();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Pharmacy ERP — Foundation</h1>
      <p className="mt-2 text-slate-600">
        The frontend is running. This page verifies connectivity to the backend API.
      </p>

      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-slate-800">Backend Health</h2>
        {loading && <p className="mt-2 text-slate-500">Checking backend…</p>}
        {error && (
          <p className="mt-2 text-red-600">
            Could not reach the backend API: {error}
          </p>
        )}
        {health && (
          <dl className="mt-3 space-y-1 text-slate-700">
            <div><dt className="inline font-medium">Status: </dt><dd className="inline text-green-600 font-medium">{health.status}</dd></div>
            <div><dt className="inline font-medium">Service: </dt><dd className="inline">{health.service}</dd></div>
            <div><dt className="inline font-medium">Uptime: </dt><dd className="inline">{health.uptimeSeconds}s</dd></div>
            <div><dt className="inline font-medium">Timestamp: </dt><dd className="inline">{health.timestamp}</dd></div>
          </dl>
        )}
      </div>
    </div>
  );
}

export default HomePage;
