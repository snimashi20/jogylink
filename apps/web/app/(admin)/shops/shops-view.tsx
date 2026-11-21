'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { CircleCheck, CircleSlash, Plus } from 'lucide-react';
import type { ShopListResponse, ShopResponse } from '@jogylink/shared';
import { Button, ConfirmDialog, DataTable, FormField } from '@jogylink/ui';
import type { DataTableColumn } from '@jogylink/ui';
import { ShopListResponseSchema } from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { formatRs } from '../../../lib/format';
import { SideNavigation } from '../../../components/side-navigation';
import { ShopForm } from './shop-form';

interface ShopsViewProps {
  initialShops: ShopListResponse;
}

type ShopStatus = 'all' | 'active' | 'inactive';

const PAGE_SIZE = 25;

export function ShopsView({ initialShops }: ShopsViewProps): ReactElement {
  const [data, setData] = useState(initialShops);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ShopStatus>('active');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ShopResponse | null>(null);
  const [deactivating, setDeactivating] = useState<ShopResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }

    let cancelled = false;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setNotice(null);
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) params.set('query', search.trim());
      if (status !== 'all') params.set('active', String(status === 'active'));

      try {
        const response = ShopListResponseSchema.parse(
          await callApi('GET', `/shops?${params.toString()}`),
        );
        if (cancelled || requestId.current !== currentRequest) return;
        setData(response);
        const lastPage = Math.max(1, Math.ceil(response.total / PAGE_SIZE));
        if (page > lastPage) setPage(lastPage);
      } catch (error) {
        if (cancelled || requestId.current !== currentRequest) return;
        setNotice(
          error instanceof ApiError && error.status === 0
            ? error.message
            : 'Could not load shops. Check the connection and try again.',
        );
      } finally {
        if (!cancelled && requestId.current === currentRequest) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, reload, search, status]);

  async function changeActive(shop: ShopResponse, isActive: boolean) {
    setNotice(null);
    try {
      await callApi('PATCH', `/shops/${shop.id}`, { isActive });
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.status === 0
          ? error.message
          : `Could not ${isActive ? 'switch on' : 'switch off'} ${shop.name}. Try again.`,
      );
      throw error;
    }
  }

  const columns: DataTableColumn<ShopResponse>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (shop) => <span className="font-mono text-caption">{shop.code}</span>,
    },
    {
      id: 'name',
      header: 'Shop',
      cell: (shop) => <span className="font-semibold">{shop.name}</span>,
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: (shop) => (
        <div>
          <span>{shop.phone || '—'}</span>
          {shop.locality ? (
            <span className="block text-caption text-stone">{shop.locality}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'creditLimit',
      header: 'Credit limit',
      className: 'text-right tabular-nums',
      cell: (shop) => formatRs(shop.creditLimit),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (shop) =>
        shop.isActive ? (
          <span className="inline-flex items-center gap-1 text-safe">
            <CircleCheck aria-hidden className="size-4" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-stone">
            <CircleSlash aria-hidden className="size-4" /> Switched off
          </span>
        ),
    },
    {
      id: 'actions',
      header: <span className="block text-right">Actions</span>,
      className: 'text-right',
      cell: (shop) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            aria-label={`Edit ${shop.name}`}
            onClick={() => setEditing(shop)}
          >
            Edit
          </Button>
          {shop.isActive ? (
            <Button
              variant="secondary"
              aria-label={`Switch off ${shop.name}`}
              onClick={() => setDeactivating(shop)}
            >
              Switch off
            </Button>
          ) : (
            <Button
              variant="secondary"
              aria-label={`Switch on ${shop.name}`}
              onClick={() => changeActive(shop, true).catch(() => undefined)}
            >
              Switch on
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row md:gap-8">
      <SideNavigation
        label="Stock and route management"
        heading="M4 management"
        items={[
          { href: '/shops', label: 'Shops' },
          { href: '/routes', label: 'Routes' },
        ]}
      />
      <section className="min-w-0 flex-1" aria-labelledby="shops-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="shops-heading" className="text-h1 font-bold">
              Shops
            </h1>
            <p className="mt-1 text-body text-stone">
              Manage shop details and credit limits. Credit balances are recorded in the ledger.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" /> Add shop
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <FormField
            label="Search shops"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Name or shop code"
            className="min-w-64"
          />
          <label className="flex flex-col gap-1 text-body font-semibold">
            Shop status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ShopStatus);
                setPage(1);
              }}
              className="h-11 rounded-control border border-sand bg-white px-3 text-body text-charcoal"
            >
              <option value="active">Active shops</option>
              <option value="inactive">Switched-off shops</option>
              <option value="all">All shops</option>
            </select>
          </label>
        </div>

        {notice ? (
          <p role="alert" className="mt-4 rounded-control bg-white px-3 py-2 text-body text-alarm">
            {notice}
          </p>
        ) : null}

        {data.total === 0 && !loading ? (
          <div className="mt-8 rounded-card border border-sand bg-white p-10 text-center">
            <p className="text-h2 font-semibold">No shops found</p>
            <p className="mt-1 mb-4 text-body text-stone">
              {search.trim()
                ? 'Try another search or status filter.'
                : status === 'active'
                  ? 'No active shops are listed. Check all shops or add a shop record.'
                  : 'Try another status filter.'}
            </p>
            {!search.trim() && status === 'active' ? (
              <Button onClick={() => setAdding(true)}>Add shop</Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable
              caption="Shops"
              columns={columns}
              rows={data.items}
              getRowKey={(shop) => shop.id}
              loading={loading}
              emptyMessage="No shops match this search. Change the search or status filter."
              pagination={{
                page: data.page,
                pageSize: data.pageSize,
                totalRows: data.total,
                onPageChange: setPage,
              }}
            />
          </div>
        )}

        <ShopForm
          open={adding}
          onOpenChange={setAdding}
          onSaved={() => setReload((value) => value + 1)}
        />
        <ShopForm
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          shop={editing ?? undefined}
          onSaved={() => setReload((value) => value + 1)}
        />
        <ConfirmDialog
          open={deactivating !== null}
          onOpenChange={(open) => {
            if (!open) setDeactivating(null);
          }}
          confirmLabel="Switch off"
          message={`${deactivating?.name ?? 'This shop'} will no longer be available for new sales. Its history will remain.`}
          onConfirm={async () => {
            if (deactivating) await changeActive(deactivating, false);
          }}
        />
      </section>
    </main>
  );
}
