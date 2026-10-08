import { definePartnerResource } from './partnerFactory.js';

const suppliersEntity = definePartnerResource({
  key: 'suppliers',
  routeKey: 'suppliers',
  responseKey: 'supplier',
  table: 'suppliers',
  permissionPrefix: 'supplier',
  noun: 'Supplier',
  extraFields: [
    { key: 'contactPerson', column: 'contact_person' },
    { key: 'telephone', column: 'telephone' },
    { key: 'email', column: 'email' },
    { key: 'address', column: 'address' },
    { key: 'country', column: 'country' },
    { key: 'taxRegistrationNumber', column: 'tax_registration_number' },
  ],
});

const CUSTOMER_TYPES = ['individual', 'business', 'institution'];

const customersEntity = definePartnerResource({
  key: 'customers',
  routeKey: 'customers',
  responseKey: 'customer',
  table: 'customers',
  permissionPrefix: 'customer',
  noun: 'Customer',
  extraFields: [
    { key: 'customerType', column: 'customer_type', coerce: (v) => (v ? String(v).toLowerCase() : 'individual') },
    { key: 'telephone', column: 'telephone' },
    { key: 'email', column: 'email' },
    { key: 'address', column: 'address' },
    { key: 'territory', column: 'territory' },
    { key: 'pricingTier', column: 'pricing_tier' },
    { key: 'creditLimit', column: 'credit_limit', coerce: (v) => (v === '' || v === undefined || v === null ? null : Number(v)) },
    { key: 'paymentTerms', column: 'payment_terms' },
  ],
  validate: (input) => {
    const details = [];
    if (input.customerType !== undefined && !CUSTOMER_TYPES.includes(String(input.customerType).toLowerCase())) {
      details.push({ field: 'customerType', message: `Must be one of: ${CUSTOMER_TYPES.join(', ')}` });
    }
    if (input.creditLimit !== undefined && input.creditLimit !== '' && input.creditLimit !== null) {
      const value = Number(input.creditLimit);
      if (!Number.isFinite(value) || value < 0) {
        details.push({ field: 'creditLimit', message: 'Credit limit must be a non-negative number' });
      }
    }
    return details;
  },
});

export default [suppliersEntity.router, customersEntity.router];
