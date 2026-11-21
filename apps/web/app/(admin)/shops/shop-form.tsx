'use client';

import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import {
  ShopCreateSchema,
  ShopResponseSchema,
  ShopUpdateSchema,
  type ShopResponse,
} from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { Button, FormField, Modal } from '@jogylink/ui';

interface ShopFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shop?: ShopResponse;
  onSaved: (shop: ShopResponse) => void;
}

interface ShopFormValues {
  code: string;
  name: string;
  phone: string;
  address: string;
  locality: string;
  creditLimit: string;
}

type ShopField = keyof ShopFormValues;
type ShopFormErrors = Partial<Record<ShopField, string>>;

function valuesFromShop(shop?: ShopResponse): ShopFormValues {
  return {
    code: shop?.code ?? '',
    name: shop?.name ?? '',
    phone: shop?.phone ?? '',
    address: shop?.address ?? '',
    locality: shop?.locality ?? '',
    creditLimit: shop?.creditLimit.toFixed(2) ?? '0.00',
  };
}

function parseCreditLimit(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function messagesFromIssues(issues: { path: PropertyKey[]; message: string }[]): ShopFormErrors {
  const errors: ShopFormErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && field in valuesFromShop()) {
      errors[field as ShopField] ??= issue.message;
    }
  }
  return errors;
}

export function ShopForm({ open, onOpenChange, shop, onSaved }: ShopFormProps): ReactElement {
  const [values, setValues] = useState<ShopFormValues>(() => valuesFromShop(shop));
  const [errors, setErrors] = useState<ShopFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(valuesFromShop(shop));
      setErrors({});
      setFormError(null);
      setPending(false);
    }
  }, [open, shop]);

  const set = (field: ShopField, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const creditLimit = parseCreditLimit(values.creditLimit);
    if (creditLimit === null) {
      setErrors({ creditLimit: 'Enter a non-negative amount, for example 500 or 500.00.' });
      return;
    }

    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      address: values.address.trim() || null,
      locality: values.locality.trim() || null,
      creditLimit,
    };
    const parsed = shop ? ShopUpdateSchema.safeParse(payload) : ShopCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(messagesFromIssues(parsed.error.issues));
      return;
    }

    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const response = shop
        ? await callApi('PATCH', `/shops/${shop.id}`, parsed.data)
        : await callApi('POST', '/shops', parsed.data);
      const savedShop = ShopResponseSchema.parse(response);
      onSaved(savedShop);
      onOpenChange(false);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409) {
        setErrors({ code: 'Another shop already uses this code. Enter a different code.' });
      } else if (status === 403) {
        setFormError('Only the owner can change shops. Sign in as the owner and try again.');
      } else {
        setFormError(
          error instanceof ApiError && status === 0
            ? error.message
            : 'Could not save this shop. Check the details and try again.',
        );
      }
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={shop ? `Edit ${shop.name}` : 'Add shop'}
      description="Set the shop's contact details and credit limit. Credit transactions are managed in the ledger."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Shop code"
          required
          value={values.code}
          maxLength={32}
          onChange={(event) => set('code', event.target.value)}
          error={errors.code}
          placeholder="e.g. SH-001"
        />
        <FormField
          label="Shop name"
          required
          value={values.name}
          maxLength={160}
          onChange={(event) => set('name', event.target.value)}
          error={errors.name}
          placeholder="e.g. Nimal Stores"
        />
        <FormField
          label="Phone"
          value={values.phone}
          maxLength={500}
          onChange={(event) => set('phone', event.target.value)}
          error={errors.phone}
          autoComplete="tel"
        />
        <FormField
          label="Locality"
          value={values.locality}
          maxLength={160}
          onChange={(event) => set('locality', event.target.value)}
          error={errors.locality}
          placeholder="Village or area"
        />
        <FormField
          label="Address"
          value={values.address}
          maxLength={500}
          onChange={(event) => set('address', event.target.value)}
          error={errors.address}
          placeholder="Street or landmark"
        />
        <FormField
          label="Credit limit (Rs)"
          required
          inputMode="decimal"
          value={values.creditLimit}
          onChange={(event) => set('creditLimit', event.target.value)}
          error={errors.creditLimit}
          helperText="This is the allowed balance limit; transactions are tracked separately in the credit ledger."
        />

        {formError ? (
          <p role="alert" className="text-caption text-alarm">
            {formError}
          </p>
        ) : null}

        <div className="mt-2 flex justify-end gap-3">
          {pending ? (
            <Button
              variant="secondary"
              disabled
              disabledReason="Please wait while this shop is saved."
            >
              Cancel
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            {shop ? 'Save changes' : 'Add shop'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
