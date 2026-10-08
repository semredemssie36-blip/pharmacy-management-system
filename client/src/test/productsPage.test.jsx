import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthContext } from '../features/auth/AuthContext.jsx';

vi.mock('../features/products/api.js', () => ({
  productsApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1, organization_id: 1, code: 'AMOX500', name: 'Amoxicillin 500mg Capsule', barcode: '111',
            status: 'active', brand_name: 'Demo', generic_name: 'Amoxicillin', prescription_classification: 'prescription',
          },
        ],
        total: 1,
      },
    }),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
  },
}));

vi.mock('../features/organizations/api.js', () => ({
  organizationsApi: { list: vi.fn().mockResolvedValue({ data: { organizations: [] } }) },
}));

vi.mock('../pages/productMasterApis.js', () => ({
  brandsApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  genericsApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  dosageFormsApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  routesApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  categoriesApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  therapeuticCategoriesApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
  manufacturersApi: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
}));

import ProductsPage from '../pages/ProductsPage.jsx';

function renderPage(permissions) {
  return render(
    <AuthContext.Provider value={{ status: 'authenticated', user: { permissions } }}>
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

test('product list page renders API data and search/filter controls', async () => {
  renderPage(['product.view', 'product.create', 'product.update', 'product.deactivate']);

  expect(await screen.findByText('Amoxicillin 500mg Capsule')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Search code/i)).toBeInTheDocument();
  expect(screen.getByText('Total: 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Deactivate/i })).toBeInTheDocument();
});

test('deactivate button is hidden without the deactivate permission', async () => {
  renderPage(['product.view']);
  await screen.findByText('Amoxicillin 500mg Capsule');
  expect(screen.queryByRole('button', { name: /Deactivate/i })).not.toBeInTheDocument();
});
