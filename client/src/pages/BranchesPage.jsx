import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { branchesApi, organizationsApi } from '../features/organizations/api.js';

async function loadOrganizations() {
  const res = await organizationsApi.list();
  return res.data.organizations.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }));
}

function BranchesPage() {
  return (
    <AdminDirectoryPage
      title="Branches"
      api={branchesApi}
      itemListKey="branches"
      parentOptions={loadOrganizations}
      permissions={{ create: 'branch.create', update: 'branch.update', deactivate: 'branch.deactivate' }}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'organizationId', label: 'Organization', type: 'parent', parentField: 'organization_id' },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'organization_id', label: 'Organization ID' },
      ]}
    />
  );
}

export default BranchesPage;
