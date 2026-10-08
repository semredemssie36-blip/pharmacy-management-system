import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { storageLocationsApi, warehousesApi } from '../features/organizations/api.js';

const STORAGE_CONDITIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'controlled', label: 'Controlled / Special' },
];

async function loadWarehouses() {
  const res = await warehousesApi.list();
  return res.data.warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));
}

function StorageLocationsPage() {
  return (
    <AdminDirectoryPage
      title="Storage Locations"
      api={storageLocationsApi}
      itemListKey="storageLocations"
      parentOptions={loadWarehouses}
      permissions={{ create: 'storage_location.create', update: 'storage_location.update', deactivate: 'storage_location.deactivate' }}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'warehouseId', label: 'Warehouse', type: 'parent', parentField: 'warehouse_id' },
        { key: 'storageCondition', label: 'Storage Condition', type: 'select', options: STORAGE_CONDITIONS, itemProp: 'storage_condition' },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'warehouse_id', label: 'Warehouse ID' },
        { key: 'storage_condition', label: 'Condition' },
      ]}
    />
  );
}

export default StorageLocationsPage;
