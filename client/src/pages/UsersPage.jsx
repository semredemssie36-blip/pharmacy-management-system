import { useEffect, useState } from 'react';

import { rolesApi, usersApi } from '../features/administration/api.js';
import { branchesApi, organizationsApi, warehousesApi } from '../features/organizations/api.js';

/** Manage users: list/create/update/deactivate + role assignment + scope assignment. */
function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', status: 'active' });
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes, orgsRes, branchesRes, warehousesRes] = await Promise.all([
        usersApi.list(),
        rolesApi.list(),
        organizationsApi.list(),
        branchesApi.list(),
        warehousesApi.list(),
      ]);
      setUsers(usersRes.data.users);
      setRoles(rolesRes.data.roles);
      setOrganizations(orgsRes.data.organizations);
      setBranches(branchesRes.data.branches);
      setWarehouses(warehousesRes.data.warehouses);
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
    setForm({ name: '', email: '', password: '', status: 'active' });
    setSelectedRoles([]);
    setScopes([]);
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  async function openEdit(user) {
    setError(null);
    setNotice(null);
    try {
      const res = await usersApi.get(user.id);
      setEditing(user);
      setForm({ name: user.name, email: user.email, password: '', status: user.status });
      setSelectedRoles((res.data.user.roles || []).map((r) => r.id));
      setScopes(
        (res.data.user.scopes || []).map((s) => ({
          scopeType: s.scope_type,
          organizationId: s.organization_id,
          branchId: s.branch_id,
          warehouseId: s.warehouse_id,
        })),
      );
      setShowForm(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleRole(id) {
    setSelectedRoles((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  function addScope() {
    setScopes([...scopes, { scopeType: 'organization', organizationId: '', branchId: '', warehouseId: '' }]);
  }

  function removeScope(index) {
    setScopes(scopes.filter((_, i) => i !== index));
  }

  function updateScope(index, patch) {
    setScopes(scopes.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function normalizedScopes() {
    return scopes
      .filter((s) => {
        if (s.scopeType === 'organization') return s.organizationId;
        if (s.scopeType === 'branch') return s.branchId;
        return s.warehouseId;
      })
      .map((s) => ({
        scopeType: s.scopeType,
        ...(s.scopeType === 'organization' ? { organizationId: Number(s.organizationId) } : {}),
        ...(s.scopeType === 'branch' ? { branchId: Number(s.branchId) } : {}),
        ...(s.scopeType === 'warehouse' ? { warehouseId: Number(s.warehouseId) } : {}),
      }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!editing && (!form.password || form.password.length < 8)) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      let userId;
      if (editing) {
        await usersApi.update(editing.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          status: form.status,
        });
        userId = editing.id;
      } else {
        const created = await usersApi.create({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
        userId = created.data.user.id;
      }
      await usersApi.setRoles(userId, selectedRoles);
      await usersApi.setScopes(userId, normalizedScopes());
      setNotice(editing ? 'User updated.' : 'User created.');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(user) {
    setError(null);
    setNotice(null);
    try {
      if (user.status === 'active') {
        await usersApi.deactivate(user.id);
        setNotice('User deactivated.');
      } else {
        await usersApi.activate(user.id);
        setNotice('User activated.');
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Users</h1>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition">
          + New user
        </button>
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 bg-white rounded-lg shadow p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </div>
            {!editing && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
              </div>
            )}
            {editing && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">Roles</p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedRoles.includes(role.id)} onChange={() => toggleRole(role.id)} />
                  {role.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Data scopes</p>
              <button type="button" onClick={addScope} className="text-sm text-sky-700 hover:underline">+ Add scope</button>
            </div>
            {scopes.length === 0 && <p className="mt-1 text-sm text-slate-500">No scopes assigned — the user will have no organization/branch/warehouse access.</p>}
            {scopes.map((scope, index) => (
              <div key={index} className="mt-2 grid grid-cols-4 gap-2 items-center">
                <select value={scope.scopeType} onChange={(e) => updateScope(index, { scopeType: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
                  <option value="organization">Organization</option>
                  <option value="branch">Branch</option>
                  <option value="warehouse">Warehouse</option>
                </select>
                {scope.scopeType === 'organization' && (
                  <select value={scope.organizationId ?? ''} onChange={(e) => updateScope(index, { organizationId: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1">
                    <option value="">Select organization…</option>
                    {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
                {scope.scopeType === 'branch' && (
                  <select value={scope.branchId ?? ''} onChange={(e) => updateScope(index, { branchId: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1">
                    <option value="">Select branch…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                {scope.scopeType === 'warehouse' && (
                  <select value={scope.warehouseId ?? ''} onChange={(e) => updateScope(index, { warehouseId: e.target.value })} className="col-span-2 rounded border border-slate-300 px-2 py-1">
                    <option value="">Select warehouse…</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => removeScope(index)} className="text-sm text-red-600 hover:underline">Remove</button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shadow-xs transition disabled:opacity-50">
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-2 text-sm transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 bg-white rounded-lg shadow">
        {loading && <p className="p-5 text-slate-500">Loading…</p>}
        {!loading && users.length === 0 && <p className="p-5 text-slate-500">No users found.</p>}
        {!loading && users.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Roles</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{user.name}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600">
                    {(user.roles || []).map((r) => r.name).join(', ') || '—'}
                  </td>
                  <td className="p-3 space-x-2">
                    <button onClick={() => openEdit(user)} className="text-sky-700 hover:underline">Edit</button>
                    <button onClick={() => toggleStatus(user)} className="text-slate-700 hover:underline">
                      {user.status === 'active' ? 'Deactivate' : 'Activate'}
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

export default UsersPage;
