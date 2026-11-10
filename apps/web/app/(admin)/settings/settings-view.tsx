'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button, ConfirmDialog, FormField } from '@jogylink/ui';
import {
  fromCents,
  retailPriceCents,
  toCents,
  type Setting,
  type SettingKey,
} from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { formatMarkup, formatRs } from '../../../lib/format';
import { checkMarkup } from '../../../lib/markup';
import { parseRupees } from '../../../lib/product-form';
import {
  inOrder,
  parseDays,
  planExpiryUpdates,
  validateExpiry,
  type ExpiryDays,
  type ExpiryErrors,
  type ExpiryKey,
} from '../../../lib/settings-form';

const date = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium' });

function Card({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: string;
  updated?: Date | string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-sand bg-white p-6 shadow-level-1">
      <h2 className="text-h2 font-semibold">{title}</h2>
      <p className="mt-1 text-body text-stone">{intro}</p>
      <div className="mt-4">{children}</div>
      {updated ? (
        <p className="mt-4 text-caption text-stone">Last changed {date(updated)}</p>
      ) : null}
    </section>
  );
}

/** Save button that says why it is off, plus the "Saved" tick (a tick and a word, not colour alone). */
function SaveRow({
  changed,
  pending,
  saved,
  error,
  onSubmit,
}: {
  changed: boolean;
  pending: boolean;
  saved: boolean;
  error: string | null;
  onSubmit?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {changed ? (
        <Button
          type={onSubmit ? 'button' : 'submit'}
          onClick={onSubmit}
          loading={pending}
          loadingLabel="Saving…"
        >
          Save changes
        </Button>
      ) : (
        <Button type="button" disabled disabledReason="Change a value first">
          Save changes
        </Button>
      )}
      {saved && !changed ? (
        <span role="status" className="inline-flex items-center gap-1 text-body text-safe">
          <Check aria-hidden className="size-4" /> Saved
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function failure(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return err.message;
  if (err instanceof ApiError && err.status === 403) return 'Only the owner can change settings.';
  if (err instanceof ApiError && (err.status === 400 || err.status === 422) && err.message)
    return err.message;
  return 'Could not save. Check the values and try again.';
}

const num = (settings: Setting[], key: SettingKey): number =>
  Number(settings.find((s) => s.key === key)?.value);
const updatedOf = (settings: Setting[], key: SettingKey) =>
  settings.find((s) => s.key === key)?.updatedAt;

/** Screen A15. Every number the business can tune, each saved on its own card. */
export function SettingsView({ settings }: { settings: Setting[] }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-h1 font-bold">Settings</h1>
      <p className="mt-1 text-body text-stone">Changes apply to the very next sale or page view.</p>
      <div className="mt-6 flex flex-col gap-6">
        <MarkupCard settings={settings} />
        <ExpiryCard settings={settings} />
        <ClaimsCard settings={settings} />
      </div>
    </main>
  );
}

/* --------------------------------------------------------------- markup */

function MarkupCard({ settings }: { settings: Setting[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(num(settings, 'retail_markup'));
  const [text, setText] = useState(formatMarkup(current));
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const checked = checkMarkup(text);
  const changed = !checked.ok || checked.value !== current;
  const example = checked.ok
    ? formatRs(fromCents(retailPriceCents(toCents(100), checked.value)))
    : null;

  function review(event: FormEvent) {
    event.preventDefault();
    if (!checked.ok) return setFieldError(checked.error);
    setFieldError(undefined);
    setError(null);
    setConfirming(true);
  }

  return (
    <Card
      title="Website prices"
      intro="The website price is the wholesale price times this markup. Products with their own markup are not affected."
      updated={updatedOf(settings, 'retail_markup')}
    >
      <form onSubmit={review} noValidate>
        <FormField
          label="Shop-wide markup"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
            setFieldError(undefined);
          }}
          error={fieldError}
          helperText={
            example
              ? `A product bought at Rs 100.00 sells on the website for ${example}.`
              : undefined
          }
        />
        <SaveRow changed={changed} pending={false} saved={saved} error={error} />
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        confirmLabel="Update website prices"
        message={`Every product without its own markup will change price on the website straight away, to wholesale × ${checked.ok ? formatMarkup(checked.value) : ''}.`}
        describeError={failure}
        onConfirm={async () => {
          if (!checked.ok) return;
          await callApi('PUT', '/settings/retail_markup', { value: checked.value });
          setCurrent(checked.value);
          setText(formatMarkup(checked.value));
          setSaved(true);
          router.refresh();
        }}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- expiry */

const EXPIRY_FIELDS: { key: ExpiryKey; label: string }[] = [
  { key: 'expiry_green_min_days', label: 'Green starts at (days left)' },
  { key: 'expiry_yellow_min_days', label: 'Yellow starts at (days left)' },
  { key: 'expiry_orange_min_days', label: 'Orange starts at (days left)' },
];

function ExpiryCard({ settings }: { settings: Setting[] }) {
  const router = useRouter();
  const current: ExpiryDays = {
    expiry_green_min_days: num(settings, 'expiry_green_min_days'),
    expiry_yellow_min_days: num(settings, 'expiry_yellow_min_days'),
    expiry_orange_min_days: num(settings, 'expiry_orange_min_days'),
  };
  const [text, setText] = useState(
    () =>
      Object.fromEntries(EXPIRY_FIELDS.map(({ key }) => [key, String(current[key])])) as Record<
        ExpiryKey,
        string
      >,
  );
  const [errors, setErrors] = useState<ExpiryErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(current);

  const changed = EXPIRY_FIELDS.some(({ key }) => text[key].trim() !== String(baseline[key]));

  // Live explanation, only while the three numbers make sense together.
  const g = parseDays(text.expiry_green_min_days);
  const y = parseDays(text.expiry_yellow_min_days);
  const o = parseDays(text.expiry_orange_min_days);
  const stages =
    g !== null &&
    y !== null &&
    o !== null &&
    inOrder({ expiry_green_min_days: g, expiry_yellow_min_days: y, expiry_orange_min_days: o })
      ? [
          ['Green', `${g} days or more left`],
          ['Yellow', `${y} to ${g - 1} days left`],
          ['Orange', `${o} to ${y - 1} days left`],
          ['Red', `${o - 1} days or fewer: blocked from every sale`],
        ]
      : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const result = validateExpiry(text);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setError(null);
    const plan = planExpiryUpdates(baseline, result.value);
    if (plan === null)
      return setError('These numbers cannot be saved safely. Check the order and try again.');
    setPending(true);
    let done = { ...baseline };
    try {
      for (const key of plan) {
        await callApi('PUT', `/settings/${key}`, { value: result.value[key] });
        done = { ...done, [key]: result.value[key] };
      }
      setBaseline(done);
      setSaved(true);
      router.refresh();
    } catch (err) {
      // Some numbers may already be saved: show the real state.
      setBaseline(done);
      setError(failure(err));
      router.refresh();
    }
    setPending(false);
  }

  return (
    <Card
      title="Expiry stages"
      intro="How many days before expiry a batch turns each colour. Red stock can never be sold."
      updated={updatedOf(settings, 'expiry_green_min_days')}
    >
      <form onSubmit={save} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          {EXPIRY_FIELDS.map(({ key, label }) => (
            <FormField
              key={key}
              label={label}
              inputMode="numeric"
              value={text[key]}
              error={errors[key]}
              onChange={(e) => {
                setText({ ...text, [key]: e.target.value });
                setSaved(false);
                setErrors({});
              }}
            />
          ))}
        </div>
        {stages ? (
          <ul
            className="mt-4 rounded-control bg-cream px-4 py-3 text-body"
            aria-label="What the stages mean"
          >
            {stages.map(([name, rule]) => (
              <li key={name}>
                <strong>{name}:</strong> {rule}
              </li>
            ))}
          </ul>
        ) : null}
        <SaveRow changed={changed} pending={pending} saved={saved} error={error} />
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------- claims */

function ClaimsCard({ settings }: { settings: Setting[] }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState({
    value: num(settings, 'claim_value_trigger'),
    days: num(settings, 'claim_age_trigger_days'),
  });
  const [value, setValue] = useState(baseline.value.toFixed(2));
  const [days, setDays] = useState(String(baseline.days));
  const [errors, setErrors] = useState<{ value?: string; days?: string }>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = parseRupees(value) !== baseline.value || parseDays(days) !== baseline.days;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const v = parseRupees(value);
    const d = parseDays(days);
    const next: typeof errors = {};
    if (v === null) next.value = 'Enter an amount in rupees, for example 5000 or 5000.50.';
    if (d === null) next.days = 'Enter a whole number of days, 1 or more.';
    setErrors(next);
    if (v === null || d === null) return;
    setError(null);
    setPending(true);
    try {
      if (v !== baseline.value) await callApi('PUT', '/settings/claim_value_trigger', { value: v });
      if (d !== baseline.days)
        await callApi('PUT', '/settings/claim_age_trigger_days', { value: d });
      setBaseline({ value: v, days: d });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(failure(err));
    }
    setPending(false);
  }

  return (
    <Card
      title="Supplier claims"
      intro="When expired or damaged stock is worth a claim to the supplier. These are starting values: confirm them with the owner."
      updated={updatedOf(settings, 'claim_value_trigger')}
    >
      <form onSubmit={save} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Claim when the value reaches (Rs)"
            inputMode="decimal"
            value={value}
            error={errors.value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
          <FormField
            label="Or when stock is this old (days)"
            inputMode="numeric"
            value={days}
            error={errors.days}
            onChange={(e) => {
              setDays(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <SaveRow changed={changed} pending={pending} saved={saved} error={error} />
      </form>
    </Card>
  );
}
