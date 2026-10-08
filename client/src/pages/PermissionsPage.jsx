import { useEffect, useState } from 'react';

import { permissionsApi } from '../features/administration/api.js';

/** Read-only list of controlled system permissions, grouped by module. */
function PermissionsPage() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    permissionsApi
      .list(moduleFilter ? { module: moduleFilter } : undefined)
      .then((res) => {
        if (!cancelled) setPermissions(res.data.permissions);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleFilter]);

  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-slate-900">Permissions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Controlled system definitions. Permissions are assigned to roles; arbitrary
        creation of new permission definitions is not exposed in the UI.
      </p>

      <div className="mt-4">
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 bg-white rounded-lg shadow p-5">
        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && permissions.length === 0 && <p className="text-slate-500">No permissions found.</p>}
        {!loading && permissions.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="p-2 font-medium">Code</th>
                <th className="p-2 font-medium">Module</th>
                <th className="p-2 font-medium">Resource</th>
                <th className="p-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-2 font-mono text-xs">{p.code}</td>
                  <td className="p-2">{p.module}</td>
                  <td className="p-2">{p.resource}</td>
                  <td className="p-2">{p.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default PermissionsPage;
