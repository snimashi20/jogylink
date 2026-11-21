'use client';

import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import {
  RouteCreateSchema,
  RouteResponseSchema,
  RouteUpdateSchema,
  type RouteResponse,
} from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { Button, FormField, Modal } from '@jogylink/ui';

interface RouteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route?: RouteResponse;
  onSaved: (route: RouteResponse) => void;
}

interface Values {
  code: string;
  name: string;
  description: string;
}

function valuesFromRoute(route?: RouteResponse): Values {
  return {
    code: route?.code ?? '',
    name: route?.name ?? '',
    description: route?.description ?? '',
  };
}

export function RouteForm({ open, onOpenChange, route, onSaved }: RouteFormProps): ReactElement {
  const [values, setValues] = useState<Values>(() => valuesFromRoute(route));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(valuesFromRoute(route));
    setErrors({});
    setFormError(null);
    setPending(false);
  }, [open, route]);

  function set(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const payload = {
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description.trim() || null,
    };
    const parsed = route
      ? RouteUpdateSchema.safeParse(payload)
      : RouteCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof Values, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && field in values) {
          nextErrors[field as keyof Values] ??= issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      const result = route
        ? await callApi('PATCH', `/routes/${route.id}`, parsed.data)
        : await callApi('POST', '/routes', parsed.data);
      onSaved(RouteResponseSchema.parse(result));
      onOpenChange(false);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409) {
        setErrors({ code: 'Another route already uses this code. Enter a different code.' });
      } else if (status === 403) {
        setFormError('Only the owner can change routes. Sign in as the owner and try again.');
      } else {
        setFormError(
          error instanceof ApiError && status === 0
            ? error.message
            : 'Could not save this route. Check the details and try again.',
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
      title={route ? `Edit ${route.name}` : 'Add route'}
      description="Create a permanent route definition. Shops and their visit order are managed separately."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Route code"
          required
          value={values.code}
          maxLength={32}
          onChange={(event) => set('code', event.target.value)}
          error={errors.code}
          placeholder="e.g. RT-01"
        />
        <FormField
          label="Route name"
          required
          value={values.name}
          maxLength={160}
          onChange={(event) => set('name', event.target.value)}
          error={errors.name}
          placeholder="e.g. North villages"
        />
        <FormField
          label="Description"
          value={values.description}
          maxLength={500}
          onChange={(event) => set('description', event.target.value)}
          error={errors.description}
          placeholder="Optional notes about the route"
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
              disabledReason="Please wait while this route is saved."
            >
              Cancel
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            {route ? 'Save changes' : 'Add route'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
