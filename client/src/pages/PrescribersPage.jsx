import { useEffect, useState } from 'react';

import { prescribersApi } from '../features/clinical/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';

/**
 * PrescribersPage: Directory of registered medical doctors and prescribers.
 */
function PrescribersPage() {
  const [prescribers, setPrescribers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal & form states
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Status toggle confirmation
  const [prescriberToToggle, setPrescriberToToggle] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const initialForm = {
    name: '',
    licenseNumber: '',
    specialty: '',
    workplace: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  };
  const [formData, setFormData] = useState(initialForm);

  async function loadPrescribers() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;

      const res = await prescribersApi.list(params);
      setPrescribers(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load prescribers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPrescribers();
  }, [page, status]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadPrescribers();
  }

  function openCreateModal() {
    setIsEditing(false);
    setEditingId(null);
    setFormData(initialForm);
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(p) {
    setIsEditing(true);
    setEditingId(p.id);
    setFormData({
      name: p.name || '',
      licenseNumber: p.license_number || '',
      specialty: p.specialty || '',
      workplace: p.workplace || '',
      phone: p.phone || '',
      email: p.email || '',
      address: p.address || '',
      notes: p.notes || '',
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (isEditing) {
        await prescribersApi.update(editingId, formData);
      } else {
        await prescribersApi.create(formData);
      }
      setShowModal(false);
      setFormData(initialForm);
      loadPrescribers();
    } catch (err) {
      setFormError(err?.response?.data?.error?.message || err.message || 'Failed to save prescriber');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!prescriberToToggle) return;
    setToggleLoading(true);
    try {
      const nextStatus = prescriberToToggle.status === 'active' ? 'inactive' : 'active';
      await prescribersApi.updateStatus(prescriberToToggle.id, nextStatus);
      setPrescriberToToggle(null);
      loadPrescribers();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to update status');
    } finally {
      setToggleLoading(false);
    }
  }

  const activeCount = prescribers.filter((p) => p.status === 'active').length;
  const inactiveCount = prescribers.filter((p) => p.status === 'inactive').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescribers / Doctors"
        subtitle="Medical doctors and licensed prescribers authorized for prescriptions"
        actions={
          <Can permission="prescriber.create">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-700 shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Prescriber
            </button>
          </Can>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Prescribers"
          value={total}
          subtitle="Registered physicians & prescribers"
          color="slate"
        />
        <SummaryCard
          title="Active Doctors"
          value={activeCount}
          subtitle="Eligible for new prescriptions"
          color="emerald"
        />
        <SummaryCard
          title="Inactive Doctors"
          value={inactiveCount}
          subtitle="Historical prescribers"
          color="amber"
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Doctor Name, License Number, Specialty, or Workplace..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z" />
            </svg>
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading prescribers...</div>
        ) : prescribers.length === 0 ? (
          <EmptyState
            title="No Prescribers Found"
            message={search ? 'No doctor records matched your search query.' : 'No prescribers registered in the system yet.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Doctor ID</th>
                  <th className="py-3 px-4">Doctor Name</th>
                  <th className="py-3 px-4">License / Reg #</th>
                  <th className="py-3 px-4">Specialty</th>
                  <th className="py-3 px-4">Hospital / Workplace</th>
                  <th className="py-3 px-4">Telephone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescribers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-sky-700">
                      {p.prescriber_number}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                      {p.license_number || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.specialty || 'General Practitioner'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.workplace || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.phone || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Can permission="prescriber.update">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                        >
                          Edit
                        </button>
                      </Can>
                      <Can permission="prescriber.deactivate">
                        <button
                          onClick={() => setPrescriberToToggle(p)}
                          className={`text-xs font-medium ml-2 ${
                            p.status === 'active'
                              ? 'text-rose-600 hover:text-rose-800'
                              : 'text-emerald-600 hover:text-emerald-800'
                          }`}
                        >
                          {p.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > limit && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} doctors
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Prescriber Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg">
                {isEditing ? 'Edit Prescriber Details' : 'Register Medical Prescriber'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Full Doctor / Prescriber Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Abebe Bikila"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Medical License / Reg #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MED-ET-10294"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Medical Specialty
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiology, Pediatrics"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Hospital / Clinic / Workplace
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tikur Anbessa Specialized Hospital"
                  value={formData.workplace}
                  onChange={(e) => setFormData({ ...formData, workplace: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    placeholder="+251..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Notes
                </label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : isEditing ? 'Update Prescriber' : 'Register Prescriber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Prescriber Deactivation */}
      <ConfirmationDialog
        isOpen={!!prescriberToToggle}
        title={prescriberToToggle?.status === 'active' ? 'Deactivate Prescriber' : 'Activate Prescriber'}
        message={
          prescriberToToggle?.status === 'active'
            ? `Deactivate ${prescriberToToggle?.name}? They will no longer be selectable for new prescriptions, but existing prescriptions will preserve their reference.`
            : `Re-activate ${prescriberToToggle?.name} for new prescriptions?`
        }
        confirmText={prescriberToToggle?.status === 'active' ? 'Deactivate' : 'Activate'}
        confirmVariant={prescriberToToggle?.status === 'active' ? 'danger' : 'primary'}
        loading={toggleLoading}
        onConfirm={handleToggleStatus}
        onCancel={() => setPrescriberToToggle(null)}
      />
    </div>
  );
}

export default PrescribersPage;
