import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../features/auth/AuthContext.jsx';
import { Can } from '../../features/auth/Can.jsx';

/**
 * Shared administration list/create/edit component for the organizational
 * directory. Keeps pages consistent; business rules remain on the backend.
 *
 * fields: [{ key, label, type: 'text'|'select', options?: [{value,label}] | async loader, required }]
 * permissions: optional {create, update, deactivate} permission codes for gating UI actions.
 */
function AdminDirectoryPage({ title, api, itemListKey, fields, columns, parentOptions, parentOptionsLabel, relatedData = [], permissions = {} }) {
  const auth = useContext(AuthContext);
  const user = auth?.user || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [parentOptionsData, setParentOptionsData] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load(params = {}) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.list({ search, status: statusFilter });
      setItems(res.data[itemListKey] ?? res.data.items ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (parentOptions) {
      parentOptions()
        .then((opts) => {
          if (Array.isArray(opts) && opts.length > 0) {
            setParentOptionsData(opts);
          } else if (user?.organization_id) {
            setParentOptionsData([{ value: user.organization_id, label: user.organization_name || 'Current Organization' }]);
          }
        })
        .catch(() => {
          if (user?.organization_id) {
            setParentOptionsData([{ value: user.organization_id, label: user.organization_name || 'Current Organization' }]);
          }
        });
    } else if (user?.organization_id) {
      setParentOptionsData([{ value: user.organization_id, label: user.organization_name || 'Current Organization' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openCreate() {
    setEditingId(null);
    const initial = {};
    fields.forEach((f) => {
      if (f.type === 'parent') {
        initial[f.key] = user?.organization_id || parentOptionsData[0]?.value || '';
      } else if (f.type === 'select' && f.options?.[0]?.value) {
        initial[f.key] = f.options[0].value;
      }
    });
    if (!initial.organizationId && user?.organization_id) {
      initial.organizationId = user.organization_id;
    } else if (!initial.organizationId && parentOptionsData.length > 0) {
      initial.organizationId = parentOptionsData[0].value;
    }
    setForm(initial);
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  function openEdit(item) {
    setEditingId(item.id);
    const next = {};
    fields.forEach((f) => {
      const prop = f.itemProp || (f.key === 'organizationId' ? 'organization_id' : f.key);
      if (f.parentField) next[f.key] = item[f.parentField] ?? '';
      else next[f.key] = item[prop] ?? '';
    });
    setForm(next);
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const missing = fields.filter((f) => f.required !== false && !String(form[f.key] ?? '').trim());
    if (missing.length) {
      setError(`Required: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {};
      fields.forEach((f) => {
        if (form[f.key] === '' || form[f.key] === undefined) return;
        payload[f.key] = f.type === 'parent' ? Number(form[f.key]) : form[f.key];
      });
      if (!payload.organizationId && user?.organization_id) {
        payload.organizationId = Number(user.organization_id);
      }
      if (editingId) {
        await api.update(editingId, payload);
        setNotice(`${title.slice(0, -1)} updated successfully.`);
      } else {
        await api.create(payload);
        setNotice(`${title.slice(0, -1)} created successfully.`);
      }
      setShowForm(false);
      setForm({});
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(item) {
    setError(null);
    setNotice(null);
    try {
      if (item.status === 'active') {
        await api.deactivate(item.id);
        setNotice(`${title.slice(0, -1)} deactivated.`);
      } else {
        await api.reactivate(item.id);
        setNotice(`${title.slice(0, -1)} reactivated.`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {permissions.create ? (
          <Can permission={permissions.create}>
            <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition">
              + New {title.slice(0, -1)}
            </button>
          </Can>
        ) : (
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition">
            + New {title.slice(0, -1)}
          </button>
        )}
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 flex gap-2">
        <input
          type="search"
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={() => load()} className="border border-slate-300 rounded px-4 py-2 text-sm hover:bg-slate-50">Apply</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-lg shadow p-5 space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-slate-700">{f.label}</label>
              {f.type === 'parent' || f.type === 'select' ? (
                <select
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                >
                  <option value="">Select…</option>
                  {(f.type === 'parent' ? parentOptionsData : f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs disabled:opacity-50 transition">
              {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 bg-white rounded-lg shadow">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && <p className="p-5 text-slate-500">No records yet.</p>}
        {!loading && items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                {columns.map((c) => <th key={c.key} className="p-3 font-medium">{c.label}</th>)}
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="p-3">{c.render ? c.render(item) : item[c.key]}</td>
                  ))}
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 space-x-2">
                    {permissions.update ? (
                      <Can permission={permissions.update}>
                        <button onClick={() => openEdit(item)} className="text-sky-700 hover:underline">Edit</button>
                      </Can>
                    ) : (
                      <button onClick={() => openEdit(item)} className="text-sky-700 hover:underline">Edit</button>
                    )}
                    {permissions.deactivate ? (
                      <Can permission={permissions.deactivate}>
                        <button onClick={() => toggleStatus(item)} className="text-slate-700 hover:underline">
                          {item.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </Can>
                    ) : (
                      <button onClick={() => toggleStatus(item)} className="text-slate-700 hover:underline">
                        {item.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminDirectoryPage;
