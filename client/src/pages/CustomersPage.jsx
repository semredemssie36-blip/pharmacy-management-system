import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';
import { customersApi } from '../features/partners/api.js';
import { organizationsApi } from '../features/organizations/api.js';

async function loadOrganizations() {
  const res = await organizationsApi.list();
  return res.data.organizations.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }));
}

function CustomersPage() {
  return (
    <AdminDirectoryPage
      title="Customers"
      api={customersApi}
      itemListKey="items"
      parentOptions={loadOrganizations}
      fields={[
        { key: 'organizationId', label: 'Organization', type: 'parent' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code', required: false },
        {
          key: 'customerType', label: 'Customer Type', type: 'select', required: false, itemProp: 'customer_type',
          options: [
            { value: 'individual', label: 'Individual' },
            { value: 'business', label: 'Business' },
            { value: 'institution', label: 'Institution' },
          ],
        },
        { key: 'telephone', label: 'Telephone', required: false },
        { key: 'email', label: 'Email', required: false },
        { key: 'address', label: 'Address', required: false },
        { key: 'territory', label: 'Territory', required: false },
        { key: 'pricingTier', label: 'Pricing Tier', required: false, itemProp: 'pricing_tier' },
        { key: 'creditLimit', label: 'Credit Limit', required: false, itemProp: 'credit_limit' },
        { key: 'paymentTerms', label: 'Payment Terms', required: false, itemProp: 'payment_terms' },
        { key: 'notes', label: 'Notes', required: false },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'customer_type', label: 'Type' },
        { key: 'telephone', label: 'Telephone' },
        { key: 'credit_limit', label: 'Credit Limit' },
      ]}
      permissions={{ create: 'customer.create', update: 'customer.update', deactivate: 'customer.deactivate' }}
    />
  );
}

export default CustomersPage;
