'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleSlash, Plus } from 'lucide-react';
import { Button, ConfirmDialog } from '@jogylink/ui';
import type { Product } from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { formatMarkup, formatRs } from '../../../lib/format';
import { ProductForm } from './product-form';

interface Props {
  products: Product[];
  defaultMarkup: number;
}

/** Screen A2: every product with the wholesale and website prices side by side. */
export function ProductsView({ products, defaultMarkup }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deactivating, setDeactivating] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (showInactive || p.active) &&
        (q === '' || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [products, search, showInactive]);

  const inactiveCount = products.filter((p) => !p.active).length;

  async function setActive(product: Product, active: boolean) {
    setNotice(null);
    try {
      await callApi('PATCH', `/products/${product.id}`, { active });
      router.refresh();
    } catch (err) {
      const detail = err instanceof ApiError && err.status === 0 ? ` ${err.message}` : '';
      setNotice(
        `Could not ${active ? 'turn on' : 'turn off'} ${product.name}.${detail || ' Try again.'}`,
      );
      throw err;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold">Products</h1>
          <p className="mt-1 text-body text-stone">
            Wholesale prices are what you set. Website prices are worked out from them (shop-wide
            markup {formatMarkup(defaultMarkup)}).
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" /> Add product
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1 text-caption font-semibold">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            className="h-9 w-72 max-w-full rounded-control border border-sand bg-white px-3 text-body font-normal"
          />
        </label>
        {inactiveCount > 0 ? (
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="size-4"
            />
            Show switched-off products ({inactiveCount})
          </label>
        ) : null}
      </div>

      {notice ? (
        <p role="alert" className="mt-4 rounded-control bg-white px-3 py-2 text-body text-alarm">
          {notice}
        </p>
      ) : null}

      {products.length === 0 ? (
        <div className="mt-8 rounded-card border border-sand bg-white p-10 text-center">
          <p className="text-h2 font-semibold">No products yet</p>
          <p className="mt-1 mb-4 text-body text-stone">Add your first product to start selling.</p>
          <Button onClick={() => setAdding(true)}>Add product</Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-body text-stone">
          No products match “{search.trim()}”. Check the spelling or clear the search.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-sand bg-white shadow-level-1">
          <table className="w-full text-left text-body">
            <caption className="sr-only">Products with wholesale and website prices</caption>
            <thead className="border-b border-sand bg-cream text-caption font-semibold">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Code
                </th>
                <th scope="col" className="px-4 py-3">
                  Product
                </th>
                <th scope="col" className="px-4 py-3">
                  Sold by
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Wholesale
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Website
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-sand last:border-0">
                  <td className="px-4 py-3 font-mono text-caption">{p.sku}</td>
                  <td className="px-4 py-3 font-semibold">{p.name}</td>
                  <td className="px-4 py-3">{p.unitType === 'piece' ? 'Piece' : 'Weight'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRs(p.wholesalePrice)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRs(p.retailPrice)}
                    {p.retailMarkupOverride !== null ? (
                      <span className="block text-caption text-stone">
                        own markup ×{formatMarkup(p.retailMarkupOverride)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {p.active ? (
                      <span className="inline-flex items-center gap-1 text-safe">
                        <CircleCheck aria-hidden className="size-4" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone">
                        <CircleSlash aria-hidden className="size-4" /> Switched off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        Edit
                      </Button>
                      {p.active ? (
                        <Button
                          variant="secondary"
                          aria-label={`Switch off ${p.name}`}
                          onClick={() => setDeactivating(p)}
                        >
                          Switch off
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          aria-label={`Switch on ${p.name}`}
                          onClick={() => setActive(p, true).catch(() => undefined)}
                        >
                          Switch on
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductForm
        open={adding}
        onOpenChange={setAdding}
        defaultMarkup={defaultMarkup}
        onSaved={() => router.refresh()}
      />
      <ProductForm
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        product={editing ?? undefined}
        defaultMarkup={defaultMarkup}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        confirmLabel="Switch off"
        message={`${deactivating?.name ?? 'This product'} will disappear from the POS and the website. Its history is kept and you can switch it back on any time.`}
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false);
        }}
      />
    </main>
  );
}
