import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { organizationsApi } from '../features/organizations/api.js';

function OrganizationPage() {
  return (
    <AdminDirectoryPage
      title="Organizations"
      api={organizationsApi}
      itemListKey="organizations"
      permissions={{ create: 'organization.create', update: 'organization.update', deactivate: 'organization.deactivate' }}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
      ]}
    />
  );
}

export default OrganizationPage;
