'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  RouteDetailResponseSchema,
  ShopListResponseSchema,
  type RouteDetailResponse,
  type RouteResponse,
  type ShopResponse,
} from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { Button, FormField, Modal } from '@jogylink/ui';

interface RouteStopsDialogProps {
  route: RouteResponse | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (route: RouteDetailResponse) => void;
}

function moveShop(shops: ShopResponse[], index: number, direction: -1 | 1): ShopResponse[] {
  const target = index + direction;
  if (target < 0 || target >= shops.length) return shops;
  const next = [...shops];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function RouteStopsDialog({
  route,
  onOpenChange,
  onSaved,
}: RouteStopsDialogProps): ReactElement {
  const open = route !== null;
  const [detail, setDetail] = useState<RouteDetailResponse | null>(null);
  const [stops, setStops] = useState<ShopResponse[]>([]);
  const [candidates, setCandidates] = useState<ShopResponse[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    setDetail(null);
    setStops([]);
    setError(null);
    setLoading(true);
    callApi('GET', `/routes/${route.id}`)
      .then((value) => RouteDetailResponseSchema.parse(value))
      .then((value) => {
        if (cancelled) return;
        setDetail(value);
        setStops(value.shops);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this route and its assigned shops. Try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCandidateLoading(true);
      const params = new URLSearchParams({ active: 'true', page: '1', pageSize: '100' });
      if (candidateQuery.trim()) params.set('query', candidateQuery.trim());
      try {
        const result = ShopListResponseSchema.parse(await callApi('GET', `/shops?${params}`));
        if (!cancelled) {
          setCandidates(result.items);
          setCandidateTotal(result.total);
        }
      } catch {
        if (!cancelled) setError('Could not search active shops. Check the connection and retry.');
      } finally {
        if (!cancelled) setCandidateLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidateQuery, open]);

  const assignedIds = new Set(stops.map((shop) => shop.id));
  const available = candidates.filter((shop) => !assignedIds.has(shop.id));
  const inactiveStop = stops.find((shop) => !shop.isActive);
  const addButtonProps =
    route?.isActive && candidateId
      ? { disabled: false as const }
      : {
          disabled: true as const,
          disabledReason: route?.isActive
            ? 'Choose a shop to add.'
            : 'Activate this route before changing its shops.',
        };
  const routeActionButtonProps = route?.isActive
    ? { disabled: false as const }
    : { disabled: true as const, disabledReason: 'Activate this route before reordering stops.' };

  function addCandidate() {
    const shop = available.find((candidate) => candidate.id === candidateId);
    if (!shop) return;
    setStops((current) => [...current, shop]);
    setCandidateId('');
  }

  async function save() {
    if (!route || !detail || pending || !route.isActive) return;
    setPending(true);
    setError(null);
    try {
      const result = RouteDetailResponseSchema.parse(
        await callApi('PUT', `/routes/${route.id}/shops`, {
          shopIds: stops.map((shop) => shop.id),
        }),
      );
      setDetail(result);
      setStops(result.shops);
      onSaved(result);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 0
          ? cause.message
          : 'Could not save this stop order. Check that every selected shop is still active, then retry.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={route ? `Stops · ${route.name}` : 'Route stops'}
      description="The order below becomes the complete route membership. A shop moved here is removed from its previous route."
    >
      {loading ? (
        <p role="status" className="text-body text-stone">
          Loading route stops…
        </p>
      ) : detail ? (
        <div className="flex flex-col gap-4">
          {!route?.isActive ? (
            <p className="rounded-control bg-cream p-3 text-body text-stone">
              This route is switched off. Activate it before changing its shop assignments.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 rounded-card border border-sand bg-cream p-4">
            <FormField
              label="Find active shops"
              type="search"
              value={candidateQuery}
              onChange={(event) => setCandidateQuery(event.target.value)}
              placeholder="Shop name or code"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-56 flex-1 flex-col gap-1 text-body font-semibold">
                Add a shop
                <select
                  value={candidateId}
                  onChange={(event) => setCandidateId(event.target.value)}
                  disabled={!route?.isActive || candidateLoading || available.length === 0}
                  className="h-11 rounded-control border border-sand bg-white px-3 text-body text-charcoal disabled:bg-sand"
                >
                  <option value="">
                    {candidateLoading
                      ? 'Searching…'
                      : available.length
                        ? 'Choose a shop'
                        : 'No unassigned results'}
                  </option>
                  {available.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.code} · {shop.name}
                      {shop.routeId ? ' · assigned to another route' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" {...addButtonProps} onClick={addCandidate}>
                Add stop
              </Button>
            </div>
            {candidateTotal > candidates.length ? (
              <p className="text-caption text-stone">
                Showing {candidates.length} of {candidateTotal} matches. Refine your search to find
                other shops.
              </p>
            ) : null}
          </div>

          <section aria-label="Ordered route stops" className="max-h-80 overflow-y-auto">
            {stops.length ? (
              <ol className="flex flex-col gap-2">
                {stops.map((shop, index) => (
                  <li
                    key={shop.id}
                    className="flex items-center gap-3 rounded-control border border-sand bg-white p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{shop.name}</span>
                      <span className="block text-caption text-stone">
                        {shop.code}
                        {shop.locality ? ` · ${shop.locality}` : ''}
                        {!shop.isActive ? ' · switched off' : ''}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      {index === 0 ? (
                        <Button
                          variant="secondary"
                          disabled
                          disabledReason="This stop is already first."
                          aria-label={`Move ${shop.name} earlier`}
                        >
                          ↑
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          {...routeActionButtonProps}
                          aria-label={`Move ${shop.name} earlier`}
                          onClick={() => setStops((current) => moveShop(current, index, -1))}
                        >
                          ↑
                        </Button>
                      )}
                      {index === stops.length - 1 ? (
                        <Button
                          variant="secondary"
                          disabled
                          disabledReason="This stop is already last."
                          aria-label={`Move ${shop.name} later`}
                        >
                          ↓
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          {...routeActionButtonProps}
                          aria-label={`Move ${shop.name} later`}
                          onClick={() => setStops((current) => moveShop(current, index, 1))}
                        >
                          ↓
                        </Button>
                      )}
                      {route?.isActive ? (
                        <Button
                          variant="secondary"
                          aria-label={`Remove ${shop.name} from route`}
                          onClick={() =>
                            setStops((current) => current.filter((item) => item.id !== shop.id))
                          }
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled
                          disabledReason="Activate this route before changing its shops."
                          aria-label={`Remove ${shop.name} from route`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-control border border-dashed border-sand p-5 text-center text-body text-stone">
                No shops assigned. Add active shops above.
              </p>
            )}
          </section>

          {inactiveStop ? (
            <p className="rounded-control bg-cream p-3 text-body text-stone">
              Remove switched-off shop {inactiveStop.name} before saving this assignment.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-caption text-alarm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            {pending ? (
              <Button
                variant="secondary"
                disabled
                disabledReason="Please wait while assignments are saved."
              >
                Cancel
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            {route?.isActive && !inactiveStop ? (
              <Button onClick={save} loading={pending} loadingLabel="Saving…">
                Save shop order
              </Button>
            ) : route?.isActive ? (
              <Button
                disabled
                disabledReason={`Remove switched-off shop ${inactiveStop?.name ?? ''} before saving.`}
              >
                Save shop order
              </Button>
            ) : (
              <Button disabled disabledReason="Activate this route before changing its shops.">
                Save shop order
              </Button>
            )}
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-caption text-alarm">
            {error}
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
