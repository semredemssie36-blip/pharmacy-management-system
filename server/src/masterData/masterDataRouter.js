import { Router } from 'express';

import { defineMasterEntity } from './masterDataFactory.js';

/**
 * Organization-scoped "simple" product-master reference entities.
 * Each one is a real, permission- and scope-enforced resource — just
 * with the same small validated shape as the others.
 */
const entities = [
  defineMasterEntity({ key: 'brands', routeKey: 'brands', responseKey: 'brand', table: 'brands', permissionPrefix: 'brand', noun: 'Brand' }),
  defineMasterEntity({ key: 'generics', routeKey: 'generics', responseKey: 'generic', table: 'generics', permissionPrefix: 'generic', noun: 'Generic' }),
  defineMasterEntity({ key: 'dosageForms', routeKey: 'dosage-forms', responseKey: 'dosageForm', table: 'dosage_forms', permissionPrefix: 'dosage_form', noun: 'Dosage form' }),
  defineMasterEntity({ key: 'routes', routeKey: 'routes', responseKey: 'route', table: 'routes', permissionPrefix: 'route', noun: 'Route' }),
  defineMasterEntity({ key: 'categories', routeKey: 'categories', responseKey: 'category', table: 'categories', permissionPrefix: 'category', noun: 'Category' }),
  defineMasterEntity({ key: 'therapeuticCategories', routeKey: 'therapeutic-categories', responseKey: 'therapeuticCategory', table: 'therapeutic_categories', permissionPrefix: 'therapeutic_category', noun: 'Therapeutic category' }),
  defineMasterEntity({
    key: 'manufacturers', routeKey: 'manufacturers', responseKey: 'manufacturer', table: 'manufacturers', permissionPrefix: 'manufacturer', noun: 'Manufacturer',
    extraFields: [{ key: 'countryOfOrigin', column: 'country_of_origin' }],
  }),
  defineMasterEntity({ key: 'activeIngredients', routeKey: 'active-ingredients', responseKey: 'activeIngredient', table: 'active_ingredients', permissionPrefix: 'active_ingredient', noun: 'Active ingredient' }),
  defineMasterEntity({ key: 'units', routeKey: 'units', responseKey: 'unit', table: 'units', permissionPrefix: 'unit', noun: 'Unit' }),
];

const router = Router();
for (const entity of entities) {
  router.use(entity.router());
}

export default router;
export { entities };
