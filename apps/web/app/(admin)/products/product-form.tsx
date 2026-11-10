'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, FormField, Modal } from '@jogylink/ui';
import {
  resolveRetailPriceCents,
  toCents,
  fromCents,
  type Product,
  type UnitType,
} from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { formatMarkup, formatRs } from '../../../lib/format';
import {
  parseRupees,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormValues,
} from '../../../lib/product-form';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when adding. */
  product?: Product;
  /** The shop-wide markup from Settings, used for the live retail preview. */
  defaultMarkup: number;
  /** Called after a successful save so the list can reload. */
  onSaved: (product: Product) => void;
}

const empty: ProductFormValues = {
  sku: '',
  name: '',
  unitType: 'piece',
  wholesale: '',
  markup: '',
};

function fromProduct(p?: Product): ProductFormValues {
  if (!p) return empty;
  return {
    sku: p.sku,
    name: p.name,
    unitType: p.unitType,
    wholesale: p.wholesalePrice.toFixed(2),
    markup: p.retailMarkupOverride === null ? '' : formatMarkup(p.retailMarkupOverride),
  };
}

export function ProductForm({ open, onOpenChange, product, defaultMarkup, onSaved }: Props) {
  const [values, setValues] = useState<ProductFormValues>(fromProduct(product));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const unitId = useId();

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (open) {
      setValues(fromProduct(product));
      setErrors({});
      setFormError(null);
      setPending(false);
    }
  }, [open, product]);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const preview = retailPreview(values, defaultMarkup);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const result = validateProductForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const saved = product
        ? await callApi<Product>('PATCH', `/products/${product.id}`, result.value)
        : await callApi<Product>('POST', '/products', result.value);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 409) {
        setErrors({ sku: 'Another product already uses this code. Enter a different one.' });
      } else if (status === 403) {
        setFormError('Only the owner can change products. Sign in as the owner and try again.');
      } else {
        setFormError(
          err instanceof ApiError && err.status === 0
            ? err.message
            : 'Could not save this product. Check the details and try again.',
        );
      }
      setPending(false);
    }
  }

  const title = product ? `Edit ${product.name}` : 'Add product';

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={title}
      description="Enter the wholesale price. The website price is worked out for you."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Product code"
          required
          value={values.sku}
          onChange={(e) => set('sku', e.target.value)}
          error={errors.sku}
          placeholder="e.g. KD-250"
          autoCapitalize="characters"
        />
        <FormField
          label="Product name"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          placeholder="e.g. Kalu Dodol 250g"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={unitId} className="text-body font-semibold text-charcoal">
            Sold by
          </label>
          <select
            id={unitId}
            value={values.unitType}
            onChange={(e) => set('unitType', e.target.value as UnitType)}
            className="h-11 rounded-control border border-sand bg-white px-3 text-body text-charcoal"
          >
            <option value="piece">Piece (packs)</option>
            <option value="weight">Weight</option>
          </select>
        </div>
        <FormField
          label="Wholesale price (Rs)"
          required
          inputMode="decimal"
          value={values.wholesale}
          onChange={(e) => set('wholesale', e.target.value)}
          error={errors.wholesale}
          placeholder="e.g. 150.00"
        />
        <FormField
          label="Own markup (optional)"
          inputMode="decimal"
          value={values.markup}
          onChange={(e) => set('markup', e.target.value)}
          error={errors.markup}
          helperText={`Leave blank to use the shop-wide markup (${formatMarkup(defaultMarkup)}).`}
          placeholder={formatMarkup(defaultMarkup)}
        />
        <p className="rounded-control bg-cream px-3 py-2 text-body" aria-live="polite">
          Website price:{' '}
          <strong>{preview === null ? 'enter a price to see it' : formatRs(preview)}</strong>
        </p>

        {formError ? (
          <p role="alert" className="text-caption text-alarm">
            {formError}
          </p>
        ) : null}

        <div className="mt-2 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              if (!pending) onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The same rule the server uses, so the preview always matches what will be saved. */
function retailPreview(v: ProductFormValues, defaultMarkup: number): number | null {
  const wholesale = parseRupees(v.wholesale);
  if (wholesale === null) return null;
  const markupText = v.markup.trim();
  const override = markupText === '' ? null : Number(markupText);
  if (override !== null && (!Number.isFinite(override) || override < 1 || override > 10))
    return null;
  return fromCents(
    resolveRetailPriceCents({
      wholesaleCents: toCents(wholesale),
      defaultMarkup,
      markupOverride: override,
    }),
  );
}
