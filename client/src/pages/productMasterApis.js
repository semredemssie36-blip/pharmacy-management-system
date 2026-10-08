import { masterResourceApi } from '../features/masterData/masterDataApi.js';

export const brandsApi = masterResourceApi('brands', 'brand');
export const genericsApi = masterResourceApi('generics', 'generic');
export const dosageFormsApi = masterResourceApi('dosage-forms', 'dosageForm');
export const routesApi = masterResourceApi('routes', 'route');
export const categoriesApi = masterResourceApi('categories', 'category');
export const therapeuticCategoriesApi = masterResourceApi('therapeutic-categories', 'therapeuticCategory');
export const manufacturersApi = masterResourceApi('manufacturers', 'manufacturer');
export const activeIngredientsApi = masterResourceApi('active-ingredients', 'activeIngredient');
export const unitsApi = masterResourceApi('units', 'unit');
