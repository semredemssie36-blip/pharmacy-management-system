import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { branchesApi, warehousesApi } from '../features/organizations/api.js';

async function loadBranches() {
  const res = await branchesApi.list();
  return res.data.branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }));
}

function WarehousesPage() {
  return (
    <AdminDirectoryPage
      title="Warehouses"
      api={warehousesApi}
      itemListKey="warehouses"
      parentOptions={loadBranches}
      permissions={{ create: 'warehouse.create', update: 'warehouse.update', deactivate: 'warehouse.deactivate' }}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'branchId', label: 'Branch', type: 'parent', parentField: 'branch_id' },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'branch_id', label: 'Branch ID' },
      ]}
    />
  );
}

export default WarehousesPage;
