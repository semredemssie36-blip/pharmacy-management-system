import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { suppliersApi } from '../features/partners/api.js';
import { organizationsApi } from '../features/organizations/api.js';

async function loadOrganizations() {
  try {
    const res = await organizationsApi.list();
    return (res.data?.organizations || []).map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }));
  } catch {
    return [];
  }
}

function SuppliersPage() {
  return (
    <AdminDirectoryPage
      title="Suppliers"
      api={suppliersApi}
      itemListKey="items"
      parentOptions={loadOrganizations}
      fields={[
        { key: 'organizationId', label: 'Organization', type: 'parent', itemProp: 'organization_id' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code / Reference', required: false },
        { key: 'contactPerson', label: 'Contact Person', required: false, itemProp: 'contact_person' },
        { key: 'telephone', label: 'Telephone', required: false },
        { key: 'email', label: 'Email', required: false },
        { key: 'address', label: 'Address', required: false },
        { key: 'country', label: 'Country', required: false },
        { key: 'taxRegistrationNumber', label: 'Tax / Registration Number', required: false, itemProp: 'tax_registration_number' },
        { key: 'notes', label: 'Notes', required: false },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'contact_person', label: 'Contact' },
        { key: 'telephone', label: 'Telephone' },
      ]}
      permissions={{ create: 'supplier.create', update: 'supplier.update', deactivate: 'supplier.deactivate' }}
    />
  );
}

export default SuppliersPage;
