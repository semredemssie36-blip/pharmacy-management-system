import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminDirectoryPage from '../components/admin/AdminDirectoryPage.jsx';

const fields = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];

function makeApi(listData) {
  return {
    list: vi.fn().mockResolvedValue({ data: { organizations: listData } }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    deactivate: vi.fn().mockResolvedValue({}),
    reactivate: vi.fn().mockResolvedValue({}),
  };
}

test('shows empty state when no records exist', async () => {
  render(
    <AdminDirectoryPage
      title="Organizations"
      api={makeApi([])}
      itemListKey="organizations"
      fields={fields}
      columns={columns}
    />,
  );
  expect(await screen.findByText('No records yet.')).toBeInTheDocument();
});

test('lists existing records', async () => {
  render(
    <AdminDirectoryPage
      title="Organizations"
      api={makeApi([{ id: 1, name: 'ABC Org', code: 'ABC', status: 'active' }])}
      itemListKey="organizations"
      fields={fields}
      columns={columns}
    />,
  );
  expect(await screen.findByText('ABC Org')).toBeInTheDocument();
  expect(screen.getByText('ABC')).toBeInTheDocument();
  expect(screen.getByText('active')).toBeInTheDocument();
});

test('validates required fields before calling the API', async () => {
  const api = makeApi([]);
  render(
    <AdminDirectoryPage
      title="Organizations"
      api={api}
      itemListKey="organizations"
      fields={fields}
      columns={columns}
    />,
  );

  await userEvent.click(await screen.findByRole('button', { name: /\+ new/i }));
  await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/Required/i);
  expect(api.create).not.toHaveBeenCalled();
});

test('creates a record through the API', async () => {
  const api = makeApi([]);
  render(
    <AdminDirectoryPage
      title="Organizations"
      api={api}
      itemListKey="organizations"
      fields={fields}
      columns={columns}
    />,
  );

  await userEvent.click(await screen.findByRole('button', { name: /\+ new/i }));
  const inputs = screen.getAllByRole('textbox');
  await userEvent.type(inputs[0], 'New Org');
  await userEvent.type(inputs[1], 'NEWORG');
  await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

  await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'New Org', code: 'NEWORG' }));
});
