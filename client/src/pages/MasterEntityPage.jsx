import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { masterResourceApi } from '../features/masterData/masterDataApi.js';
import { organizationsApi } from '../features/organizations/api.js';

async function loadOrganizations() {
  const res = await organizationsApi.list();
  return res.data.organizations.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }));
}

const entityConfig = [
  { title: 'Brands', routePath: 'brands', responseKey: 'brand', permissionPrefix: 'brand' },
  { title: 'Generics', routePath: 'generics', responseKey: 'generic', permissionPrefix: 'generic' },
  { title: 'Dosage Forms', routePath: 'dosage-forms', responseKey: 'dosageForm', permissionPrefix: 'dosage_form' },
  { title: 'Routes', routePath: 'routes', responseKey: 'route', permissionPrefix: 'route' },
  { title: 'Categories', routePath: 'categories', responseKey: 'category', permissionPrefix: 'category' },
  { title: 'Therapeutic Categories', routePath: 'therapeutic-categories', responseKey: 'therapeuticCategory', permissionPrefix: 'therapeutic_category' },
  { title: 'Manufacturers', routePath: 'manufacturers', responseKey: 'manufacturer', permissionPrefix: 'manufacturer', extraColumn: { key: 'countryOfOrigin', label: 'Country of Origin' } },
  { title: 'Active Ingredients', routePath: 'active-ingredients', responseKey: 'activeIngredient', permissionPrefix: 'active_ingredient' },
  { title: 'Units', routePath: 'units', responseKey: 'unit', permissionPrefix: 'unit' },
];

/**
 * Generic management page for the product-master reference entities
 * (brands, generics, dosage forms, routes, categories, therapeutic
 * categories, manufacturers, active ingredients, units). Each maps
 * one-to-one to a real, permission- and scope-enforced backend resource.
 */
export function MasterEntityPage({ config }) {
  const fields = [
    { key: 'organizationId', label: 'Organization', type: 'parent' },
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', required: false },
  ];
  if (config.extraColumn) {
    fields.push({ key: config.extraColumn.key, label: config.extraColumn.label, required: false });
  }
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
  ];
  if (config.extraColumn) columns.push({ key: config.extraColumn.key, label: config.extraColumn.label });

  return (
    <AdminDirectoryPage
      title={config.title}
      api={masterResourceApi(config.routePath, config.responseKey)}
      itemListKey="items"
      parentOptions={loadOrganizations}
      fields={fields}
      columns={columns}
      permissions={{
        create: `${config.permissionPrefix}.create`,
        update: `${config.permissionPrefix}.update`,
        deactivate: `${config.permissionPrefix}.deactivate`,
      }}
    />
  );
}

export { entityConfig };
