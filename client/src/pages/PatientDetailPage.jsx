import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { patientsApi } from '../features/clinical/api.js';
import { Can } from '../features/auth/Can.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import EmptyState from '../components/common/EmptyState.jsx';

/**
 * PatientDetailPage: Clinical patient record profile, demographics,
 * allergies, insurance, and medical history tabs.
 */
function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('prescriptions');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  async function loadPatient() {
    setLoading(true);
    setError(null);
    try {
      const res = await patientsApi.get(id);
      const data = res.data.patient;
      setPatient(data);
      setEditFormData({
        firstName: data.first_name || '',
        lastName: data.last_name || '',
        gender: data.gender || 'female',
        dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth).toISOString().split('T')[0] : '',
        phone: data.phone || '',
        email: data.email || '',
        identificationType: data.identification_type || '',
        identificationNumber: data.identification_number || '',
        address: data.address || '',
        emergencyContactName: data.emergency_contact_name || '',
        emergencyContactPhone: data.emergency_contact_phone || '',
        emergencyContactRelationship: data.emergency_contact_relationship || '',
        allergies: data.allergies || '',
        insuranceProvider: data.insurance_provider || '',
        insurancePolicyNumber: data.insurance_policy_number || '',
        notes: data.notes || '',
      });
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load patient record');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatient();
  }, [id]);

  async function handleUpdatePatient(e) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    try {
      await patientsApi.update(id, editFormData);
      setShowEditModal(false);
      loadPatient();
    } catch (err) {
      setEditError(err?.response?.data?.error?.message || err.message || 'Failed to update patient');
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        Loading patient clinical profile...
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {error || 'Patient not found'}
        </div>
        <Link to="/clinical/patients" className="text-sky-600 hover:underline text-sm inline-block">
          &larr; Back to Patients Directory
        </Link>
      </div>
    );
  }

  const fullName = `${patient.first_name} ${patient.last_name}`;
  const dobFormatted = patient.date_of_birth ? new Date(patient.date_of_birth).toISOString().split('T')[0] : 'N/A';
  const prescriptions = patient.prescriptionHistory || [];

  return (
    <div className="space-y-6">
      {/* Header and profile banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xl uppercase shadow-inner">
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
                <StatusBadge status={patient.status} />
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                <span className="font-mono text-sky-700 font-semibold">{patient.patient_number}</span>
                <span>•</span>
                <span className="capitalize">{patient.gender}</span>
                <span>•</span>
                <span>{dobFormatted} ({patient.age !== null ? `${patient.age} yrs` : 'Age N/A'})</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Can permission="patient.update">
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Edit Demographics
              </button>
            </Can>
            <Link
              to="/clinical/patients"
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Back to List
            </Link>
          </div>
        </div>

        {/* Demographics Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Telephone</span>
            <span className="font-medium text-slate-800">{patient.phone || 'Not recorded'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Email</span>
            <span className="font-medium text-slate-800">{patient.email || 'Not recorded'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">National / Reference ID</span>
            <span className="font-medium text-slate-800">
              {patient.identification_number ? `${patient.identification_type || 'ID'}: ${patient.identification_number}` : 'None'}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Residential Address</span>
            <span className="font-medium text-slate-800">{patient.address || 'Not recorded'}</span>
          </div>
        </div>

        {/* Secondary Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-slate-100 mt-4 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Emergency Contact</span>
            <span className="font-medium text-slate-800">
              {patient.emergency_contact_name
                ? `${patient.emergency_contact_name} (${patient.emergency_contact_relationship || 'Contact'} - ${patient.emergency_contact_phone || 'No phone'})`
                : 'None'}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Insurance Coverage</span>
            <span className="font-medium text-slate-800">
              {patient.insurance_provider
                ? `${patient.insurance_provider} (${patient.insurance_policy_number || 'No policy#'})`
                : 'Self-Pay / None'}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Allergies & Adverse Reactions</span>
            <span className={`font-medium ${patient.allergies ? 'text-rose-600 font-semibold' : 'text-slate-800'}`}>
              {patient.allergies || 'No documented allergies'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('prescriptions')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'prescriptions'
                ? 'border-sky-600 text-sky-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Prescriptions ({prescriptions.length})
          </button>
          <button
            onClick={() => setActiveTab('clinical')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'clinical'
                ? 'border-sky-600 text-sky-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Clinical Notes
          </button>
          <button
            onClick={() => setActiveTab('dispensing')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'dispensing'
                ? 'border-sky-600 text-sky-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Dispensing History
          </button>
          <button
            onClick={() => setActiveTab('refills')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'refills'
                ? 'border-sky-600 text-sky-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Refill & Return History
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'prescriptions' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {prescriptions.length === 0 ? (
            <EmptyState
              title="No Prescriptions on Record"
              message="No medical prescriptions have been registered for this patient yet."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Rx Number</th>
                    <th className="py-3 px-4">Prescriber / Doctor</th>
                    <th className="py-3 px-4">Prescription Date</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prescriptions.map((rx) => (
                    <tr key={rx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-sky-700">
                        {rx.prescription_number}
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        {rx.prescriber_name || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rx.prescription_date ? new Date(rx.prescription_date).toISOString().split('T')[0] : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rx.expiry_date ? new Date(rx.expiry_date).toISOString().split('T')[0] : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={rx.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to="/clinical/prescriptions"
                          className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                        >
                          View in Prescriptions
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'clinical' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Known Allergies & Contraindications
            </h4>
            <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-700">
              {patient.allergies || 'No specific allergies or sensitivities recorded for this patient.'}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Medical & Clinical Notes
            </h4>
            <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-700">
              {patient.notes || 'No pharmacist or physician notes recorded for this patient.'}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dispensing' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <EmptyState
            title="Dispensing History"
            message="No dispensing transactions have been recorded yet. Real dispensing workflows will automatically record medication dispatch records here once Task 12 is active."
          />
        </div>
      )}

      {activeTab === 'refills' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <EmptyState
            title="Refills & Returns History"
            message="No refills or medicine returns have been processed yet. Prescription refill authorizations and return credits will be documented here."
          />
        </div>
      )}

      {/* Edit Demographics Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg">Edit Patient Demographics</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdatePatient} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.firstName}
                    onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
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
                    value={editFormData.lastName}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Sex / Gender
                  </label>
                  <select
                    value={editFormData.gender}
                    onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
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
                    value={editFormData.dateOfBirth}
                    onChange={(e) => setEditFormData({ ...editFormData, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
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
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Allergies
                </label>
                <input
                  type="text"
                  value={editFormData.allergies}
                  onChange={(e) => setEditFormData({ ...editFormData, allergies: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Notes
                </label>
                <textarea
                  rows="2"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientDetailPage;
