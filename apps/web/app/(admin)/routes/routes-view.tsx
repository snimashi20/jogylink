'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { CircleCheck, CircleSlash, Plus, Route as RouteIcon, Store } from 'lucide-react';
import {
  RouteListResponseSchema,
  type RouteListResponse,
  type RouteResponse,
} from '@jogylink/shared';
import { Button, ConfirmDialog, DataTable, FormField } from '@jogylink/ui';
import type { DataTableColumn } from '@jogylink/ui';
import { ApiError, callApi } from '../../../lib/client-api';
import { SideNavigation } from '../../../components/side-navigation';
import { RouteForm } from './route-form';
import { RouteStopsDialog } from './route-stops-dialog';

interface RoutesViewProps {
  initialRoutes: RouteListResponse;
}

type RouteStatus = 'all' | 'active' | 'inactive';
const PAGE_SIZE = 25;

export function RoutesView({ initialRoutes }: RoutesViewProps): ReactElement {
  const [data, setData] = useState(initialRoutes);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RouteStatus>('active');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RouteResponse | null>(null);
  const [deactivating, setDeactivating] = useState<RouteResponse | null>(null);
  const [managingStops, setManagingStops] = useState<RouteResponse | null>(null);
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
        const result = RouteListResponseSchema.parse(await callApi('GET', `/routes?${params}`));
        if (cancelled || requestId.current !== currentRequest) return;
        setData(result);
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (page > lastPage) setPage(lastPage);
      } catch (error) {
        if (cancelled || requestId.current !== currentRequest) return;
        setNotice(
          error instanceof ApiError && error.status === 0
            ? error.message
            : 'Could not load routes. Check the connection and try again.',
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

  async function setActive(route: RouteResponse, isActive: boolean) {
    setNotice(null);
    try {
      await callApi('PATCH', `/routes/${route.id}`, { isActive });
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.status === 0
          ? error.message
          : `Could not ${isActive ? 'activate' : 'deactivate'} ${route.name}. Try again.`,
      );
      throw error;
    }
  }

  const columns: DataTableColumn<RouteResponse>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (route) => <span className="font-mono text-caption">{route.code}</span>,
    },
    {
      id: 'name',
      header: 'Route',
      cell: (route) => (
        <div>
          <span className="block font-semibold">{route.name}</span>
          {route.description ? (
            <span className="block text-caption text-stone">{route.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (route) =>
        route.isActive ? (
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
      cell: (route) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            aria-label={`Manage shops on ${route.name}`}
            onClick={() => setManagingStops(route)}
          >
            Shops and order
          </Button>
          <Button
            variant="secondary"
            aria-label={`Edit ${route.name}`}
            onClick={() => setEditing(route)}
          >
            Edit
          </Button>
          {route.isActive ? (
            <Button
              variant="secondary"
              aria-label={`Switch off ${route.name}`}
              onClick={() => setDeactivating(route)}
            >
              Switch off
            </Button>
          ) : (
            <Button
              variant="secondary"
              aria-label={`Switch on ${route.name}`}
              onClick={() => setActive(route, true).catch(() => undefined)}
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
          { href: '/shops', label: 'Shops', icon: <Store className="size-5" /> },
          { href: '/routes', label: 'Routes', icon: <RouteIcon className="size-5" /> },
        ]}
      />
      <section className="min-w-0 flex-1" aria-labelledby="routes-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="routes-heading" className="text-h1 font-bold">
              Routes
            </h1>
            <p className="mt-1 text-body text-stone">
              Create regular delivery routes and arrange the shops in visit order.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" /> Add route
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <FormField
            label="Search routes"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Name or route code"
            className="min-w-64"
          />
          <label className="flex flex-col gap-1 text-body font-semibold">
            Route status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as RouteStatus);
                setPage(1);
              }}
              className="h-11 rounded-control border border-sand bg-white px-3 text-body text-charcoal"
            >
              <option value="active">Active routes</option>
              <option value="inactive">Switched-off routes</option>
              <option value="all">All routes</option>
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
            <p className="text-h2 font-semibold">No routes found</p>
            <p className="mt-1 mb-4 text-body text-stone">
              {search.trim()
                ? 'Try another search or status filter.'
                : 'Add a route to organize shops into a delivery order.'}
            </p>
            {!search.trim() && status === 'active' ? (
              <Button onClick={() => setAdding(true)}>Add route</Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable
              caption="Routes"
              columns={columns}
              rows={data.items}
              getRowKey={(route) => route.id}
              loading={loading}
              emptyMessage="No routes match this search. Change the search or status filter."
              pagination={{
                page: data.page,
                pageSize: data.pageSize,
                totalRows: data.total,
                onPageChange: setPage,
              }}
            />
          </div>
        )}

        <RouteForm
          open={adding}
          onOpenChange={setAdding}
          onSaved={() => {
            setSearch('');
            setStatus('active');
            setPage(1);
            setReload((value) => value + 1);
          }}
        />
        <RouteForm
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          route={editing ?? undefined}
          onSaved={() => setReload((value) => value + 1)}
        />
        <RouteStopsDialog
          route={managingStops}
          onOpenChange={(open) => {
            if (!open) setManagingStops(null);
          }}
          onSaved={() => setReload((value) => value + 1)}
        />
        <ConfirmDialog
          open={deactivating !== null}
          onOpenChange={(open) => {
            if (!open) setDeactivating(null);
          }}
          confirmLabel="Switch off"
          message={`${deactivating?.name ?? 'This route'} will no longer be available for new assignments. Existing shop assignments remain in place.`}
          onConfirm={async () => {
            if (deactivating) await setActive(deactivating, false);
          }}
        />
      </section>
    </main>
  );
}
