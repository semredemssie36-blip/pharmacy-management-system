import { useEffect, useState } from 'react';

import { permissionsApi, rolesApi } from '../features/administration/api.js';

/** Manage roles: list/create/update/deactivate + permission assignment. */
function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // role being edited (null = new)
  const [form, setForm] = useState({ name: '', code: '', description: '', status: 'active' });
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([rolesApi.list(), permissionsApi.list()]);
      setRoles(rolesRes.data.roles);
      setPermissions(permsRes.data.permissions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', code: '', description: '', status: 'active' });
    setSelectedPermissions([]);
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  async function openEdit(role) {
    setError(null);
    setNotice(null);
    try {
      const res = await rolesApi.get(role.id);
      setEditing(role);
      setForm({ name: role.name, code: role.code, description: role.description || '', status: role.status });
      setSelectedPermissions(res.data.role.permissions.map((p) => p.id));
      setShowForm(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function togglePermission(id) {
    setSelectedPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.name.trim() || !form.code.trim()) {
      setError('Name and code are required.');
      return;
    }

    setSubmitting(true);
    try {
      let roleId = editing?.id;
      if (editing) {
        await rolesApi.update(editing.id, {
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
          status: form.status,
        });
      } else {
        const created = await rolesApi.create({
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
        });
        roleId = created.data.role.id;
      }
      await rolesApi.setPermissions(roleId, selectedPermissions);
      setNotice(editing ? 'Role updated.' : 'Role created.');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(role) {
    setError(null);
    setNotice(null);
    try {
      if (role.status === 'active') {
        await rolesApi.deactivate(role.id);
        setNotice('Role deactivated.');
      } else {
        await rolesApi.update(role.id, { status: 'active' });
        setNotice('Role reactivated.');
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = permissions.reduce((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Roles</h1>
        <button onClick={openCreate} className="bg-slate-900 text-white rounded px-4 py-2 text-sm hover:bg-slate-800">
          + New role
        </button>
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-lg shadow p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Code</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
          </div>
          {editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-slate-700">Permissions</p>
            {Object.entries(grouped).map(([module, perms]) => (
              <div key={module} className="mt-2">
                <p className="text-xs uppercase text-slate-500">{module}</p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {perms.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(p.id)}
                        onChange={() => togglePermission(p.id)}
                      />
                      <span className="font-mono text-xs">{p.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-300 rounded px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 bg-white rounded-lg shadow">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && roles.length === 0 && <p className="p-5 text-slate-500">No roles yet.</p>}
        {!loading && roles.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="p-3 font-medium">ID</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Code</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{role.id}</td>
                  <td className="p-3">{role.name}</td>
                  <td className="p-3 font-mono text-xs">{role.code}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${role.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                      {role.status}
                    </span>
                  </td>
                  <td className="p-3 space-x-2">
                    <button onClick={() => openEdit(role)} className="text-sky-700 hover:underline">Edit</button>
                    <button onClick={() => toggleStatus(role)} className="text-slate-700 hover:underline">
                      {role.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </button>
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

export default RolesPage;
