import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { patientsApi } from '../features/clinical/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import SummaryCard from '../components/common/SummaryCard.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ConfirmationDialog from '../components/common/ConfirmationDialog.jsx';

/**
 * PatientsPage: Clinical directory of patients with search, filtering,
 * duplicate detection warnings, and profile navigation.
 */
function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal & form states
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [duplicatesWarning, setDuplicatesWarning] = useState([]);

  // Patient deactivation confirmation
  const [patientToToggle, setPatientToToggle] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const initialForm = {
    firstName: '',
    lastName: '',
    gender: 'female',
    dateOfBirth: '',
    phone: '',
    email: '',
    identificationType: '',
    identificationNumber: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    allergies: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    notes: '',
  };
  const [formData, setFormData] = useState(initialForm);

  async function loadPatients() {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (status) params.status = status;

      const res = await patientsApi.list(params);
      setPatients(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, [page, status]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadPatients();
  }

  async function checkForDuplicates(phone, idNum) {
    if (!phone && !idNum) {
      setDuplicatesWarning([]);
      return;
    }
    try {
      const res = await patientsApi.checkDuplicates({ phone, identificationNumber: idNum });
      setDuplicatesWarning(res.data.duplicates || []);
    } catch (e) {
      // Ignore background check failure
    }
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handlePhoneOrIdBlur() {
    await checkForDuplicates(formData.phone, formData.identificationNumber);
  }

  async function handleCreatePatient(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await patientsApi.create(formData);
      setShowModal(false);
      setFormData(initialForm);
      setDuplicatesWarning([]);
      setPage(1);
      loadPatients();
    } catch (err) {
      setFormError(err?.response?.data?.error?.message || err.message || 'Failed to save patient');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!patientToToggle) return;
    setToggleLoading(true);
    try {
      const nextStatus = patientToToggle.status === 'active' ? 'inactive' : 'active';
      await patientsApi.updateStatus(patientToToggle.id, nextStatus);
      setPatientToToggle(null);
      loadPatients();
    } catch (err) {
      alert(err?.response?.data?.error?.message || err.message || 'Failed to update patient status');
    } finally {
      setToggleLoading(false);
    }
  }

  const activeCount = patients.filter((p) => p.status === 'active').length;
  const inactiveCount = patients.filter((p) => p.status === 'inactive').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        subtitle="Clinical patient master directory and medical profile registry"
        actions={
          <Can permission="patient.create">
            <button
              onClick={() => {
                setFormData(initialForm);
                setDuplicatesWarning([]);
                setFormError(null);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-700 shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Register New Patient
            </button>
          </Can>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Patients"
          value={total}
          subtitle="Registered in current organization"
          color="slate"
        />
        <SummaryCard
          title="Active Patients"
          value={activeCount}
          subtitle="Eligible for new prescriptions"
          color="emerald"
        />
        <SummaryCard
          title="Inactive Patients"
          value={inactiveCount}
          subtitle="Deactivated clinical records"
          color="amber"
        />
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Patient ID, Name, Phone, or National ID..."
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

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Patients Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading patient records...</div>
        ) : patients.length === 0 ? (
          <EmptyState
            title="No Patients Found"
            message={search ? 'No patient records matched your search query.' : 'No patients registered in the clinical directory yet.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Gender</th>
                  <th className="py-3 px-4">DOB / Age</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((p) => {
                  const fullName = `${p.first_name} ${p.last_name}`;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-sky-700">
                        {p.patient_number}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <Link
                          to={`/clinical/patients/${p.id}`}
                          className="hover:text-sky-600 hover:underline"
                        >
                          {fullName}
                        </Link>
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600">
                        {p.gender}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>{p.date_of_birth ? new Date(p.date_of_birth).toISOString().split('T')[0] : 'N/A'}</div>
                        {p.age !== null && p.age !== undefined && (
                          <div className="text-xs text-slate-400">{p.age} yrs old</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {p.phone || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Link
                          to={`/clinical/patients/${p.id}`}
                          className="inline-flex items-center text-xs text-sky-600 hover:text-sky-800 font-medium"
                        >
                          Profile
                        </Link>
                        <Can permission="patient.deactivate">
                          <button
                            onClick={() => setPatientToToggle(p)}
                            className={`inline-flex items-center text-xs font-medium ml-2 ${
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {!loading && total > limit && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} records
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

      {/* Register Patient Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg">Register Clinical Patient</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {formError}
                </div>
              )}

              {/* Duplicate Warning Alert */}
              {duplicatesWarning.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Possible Duplicate Record Detected
                  </div>
                  <p>Existing patients found with matching phone or national ID:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {duplicatesWarning.map((d) => (
                      <li key={d.id}>
                        <span className="font-mono font-medium">{d.patient_number}</span> — {d.first_name} {d.last_name} ({d.phone || 'No phone'})
                      </li>
                    ))}
                  </ul>
                  <p className="text-amber-700 font-medium">Verify if this is the same patient. No records will be automatically merged.</p>
                </div>
              )}

              {/* Basic Demographics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Sex / Gender <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Date of Birth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleFormChange}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleFormChange}
                    onBlur={handlePhoneOrIdBlur}
                    placeholder="+251..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Identification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    ID Document Type
                  </label>
                  <input
                    type="text"
                    name="identificationType"
                    placeholder="National ID / Kebele / Passport"
                    value={formData.identificationType}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    ID Document Number
                  </label>
                  <input
                    type="text"
                    name="identificationNumber"
                    value={formData.identificationNumber}
                    onChange={handleFormChange}
                    onBlur={handlePhoneOrIdBlur}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              {/* Emergency Contact */}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Emergency Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      name="emergencyContactName"
                      placeholder="Contact Name"
                      value={formData.emergencyContactName}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      name="emergencyContactPhone"
                      placeholder="Phone"
                      value={formData.emergencyContactPhone}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      name="emergencyContactRelationship"
                      placeholder="Relationship (e.g. Spouse)"
                      value={formData.emergencyContactRelationship}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical Notes & Allergies */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Known Allergies
                  </label>
                  <input
                    type="text"
                    name="allergies"
                    placeholder="e.g. Penicillin, NSAIDs, Sulfa"
                    value={formData.allergies}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Insurance Provider
                    </label>
                    <input
                      type="text"
                      name="insuranceProvider"
                      value={formData.insuranceProvider}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Policy / Membership No.
                    </label>
                    <input
                      type="text"
                      name="insurancePolicyNumber"
                      value={formData.insurancePolicyNumber}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Clinical Notes
                  </label>
                  <textarea
                    rows="2"
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
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
                  {saving ? 'Registering...' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Patient Deactivation / Activation */}
      <ConfirmationDialog
        isOpen={!!patientToToggle}
        title={patientToToggle?.status === 'active' ? 'Deactivate Patient' : 'Activate Patient'}
        message={
          patientToToggle?.status === 'active'
            ? `Are you sure you want to deactivate ${patientToToggle?.first_name} ${patientToToggle?.last_name}? Historical prescriptions and medical records will be preserved.`
            : `Re-activate ${patientToToggle?.first_name} ${patientToToggle?.last_name} for clinical care?`
        }
        confirmText={patientToToggle?.status === 'active' ? 'Deactivate' : 'Activate'}
        confirmVariant={patientToToggle?.status === 'active' ? 'danger' : 'primary'}
        loading={toggleLoading}
        onConfirm={handleToggleStatus}
        onCancel={() => setPatientToToggle(null)}
      />
    </div>
  );
}

export default PatientsPage;
