// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@jogylink/shared';
import { ProductsView } from '../app/(admin)/products/products-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const product = (over: Partial<Product> = {}): Product => ({
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'KD-250',
  name: 'Kalu Dodol 250g',
  unitType: 'piece',
  wholesalePrice: 100,
  retailMarkupOverride: null,
  retailPrice: 110,
  active: true,
  ...over,
});

const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe('ProductsView', () => {
  it('shows wholesale and website prices side by side, and marks an own markup', () => {
    render(
      <ProductsView
        defaultMarkup={1.1}
        products={[
          product(),
          product({
            id: '2',
            sku: 'WA-1',
            name: 'Wattalapam',
            wholesalePrice: 200,
            retailMarkupOverride: 1.25,
            retailPrice: 250,
          }),
        ]}
      />,
    );
    const row = screen.getByRole('row', { name: /Kalu Dodol/ });
    expect(within(row).getByText('Rs 100.00')).toBeInTheDocument();
    expect(within(row).getByText('Rs 110.00')).toBeInTheDocument();
    const custom = screen.getByRole('row', { name: /Wattalapam/ });
    expect(within(custom).getByText('Rs 250.00')).toBeInTheDocument();
    expect(within(custom).getByText(/own markup ×1\.25/)).toBeInTheDocument();
  });

  it('hides switched-off products until asked, and uses icon plus text for status', async () => {
    render(
      <ProductsView
        defaultMarkup={1.1}
        products={[product(), product({ id: '2', name: 'Old Toffee', sku: 'OT', active: false })]}
      />,
    );
    expect(screen.queryByRole('cell', { name: 'Old Toffee' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Show switched-off/));
    expect(screen.getByRole('cell', { name: 'Old Toffee' })).toBeInTheDocument();
    expect(screen.getByText('Switched off')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('filters by name or code and says what to do when nothing matches', async () => {
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(/No products match “zzz”/)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'kd-2');
    expect(screen.getByRole('cell', { name: 'Kalu Dodol 250g' })).toBeInTheDocument();
  });

  it('has a helpful empty state', () => {
    render(<ProductsView defaultMarkup={1.1} products={[]} />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
  });

  it('previews the website price live and creates the product with clean values', async () => {
    const fetchMock = reply(201, product());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: /Add product/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Product code/), 'wa-1');
    await user.type(within(dialog).getByLabelText(/Product name/), 'Wattalapam');
    await user.type(within(dialog).getByLabelText(/Wholesale price/), '200');
    expect(within(dialog).getByText('Rs 220.00')).toBeInTheDocument(); // 200 x shop-wide 1.10

    await user.type(within(dialog).getByLabelText(/Own markup/), '1.25');
    expect(within(dialog).getByText('Rs 250.00')).toBeInTheDocument(); // own markup wins

    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/backend/products');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      sku: 'WA-1',
      name: 'Wattalapam',
      unitType: 'piece',
      wholesalePrice: 200,
      retailMarkupOverride: 1.25,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not call the API when the form is invalid, and explains each field', async () => {
    const fetchMock = reply(201);
    vi.stubGlobal('fetch', fetchMock);
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /Add product/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Own markup/), '0.5');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(within(dialog).getByText(/Enter a product code/)).toBeInTheDocument();
    expect(within(dialog).getByText(/never cheaper than the shop/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts a duplicate-code error on the code field, not in a generic message', async () => {
    vi.stubGlobal('fetch', reply(409, { message: 'taken' }));
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /Add product/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Product code/), 'KD-250');
    await user.type(within(dialog).getByLabelText(/Product name/), 'Dup');
    await user.type(within(dialog).getByLabelText(/Wholesale price/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Add product' }));

    expect(
      await within(dialog).findByText(/Another product already uses this code/),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('edits a product, pre-filled, sending PATCH', async () => {
    const fetchMock = reply(200, product());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Edit Kalu Dodol/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Wholesale price/)).toHaveValue('100.00');
    await user.clear(within(dialog).getByLabelText(/Wholesale price/));
    await user.type(within(dialog).getByLabelText(/Wholesale price/), '120');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/backend/products/11111111-1111-4111-8111-111111111111');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body).wholesalePrice).toBe(120);
  });

  it('asks before switching a product off, naming it, and only then calls the API', async () => {
    const fetchMock = reply(200, product({ active: false }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProductsView defaultMarkup={1.1} products={[product()]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Switch off Kalu Dodol/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Kalu Dodol 250g will disappear from the POS/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ active: false });
  });

  it('switches a product back on without asking', async () => {
    const fetchMock = reply(200, product());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProductsView defaultMarkup={1.1} products={[product({ active: false })]} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Show switched-off/));
    await user.click(screen.getByRole('button', { name: /Switch on Kalu Dodol/ }));
    await waitFor(() =>
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ active: true }),
    );
  });
});
