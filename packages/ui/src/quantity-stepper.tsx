'use client';

import { useEffect, useId, useState, type ReactElement } from 'react';
import { Button } from './button';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  disabledReason?: string;
}

/** C20 — compact 40 px quantity controls for web forms and loading screens. */
export function QuantityStepper({
  value,
  onChange,
  label = 'Quantity',
  min = 0,
  max,
  step = 1,
  disabledReason,
}: QuantityStepperProps): ReactElement {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const boundsError =
    !Number.isInteger(min) || (max !== undefined && !Number.isInteger(max))
      ? 'Quantity limits must be whole numbers.'
      : max !== undefined && max < min
        ? 'Maximum quantity must be at least the minimum.'
        : !Number.isInteger(step) || step <= 0
          ? 'Quantity step must be a positive whole number.'
          : null;
  const parsed = draft.trim() === '' ? Number.NaN : Number(draft);
  const inputError =
    draft.trim() === '' || !Number.isInteger(parsed)
      ? 'Enter a whole-number quantity.'
      : parsed < min
        ? `Quantity cannot be less than ${min}.`
        : max !== undefined && parsed > max
          ? `Quantity cannot be greater than ${max}.`
          : null;
  const error = boundsError ?? inputError;
  const unavailable = Boolean(disabledReason) || Boolean(boundsError);
  const canDecrease = value - step >= min;
  const canIncrease = max === undefined || value + step <= max;

  function adjust(direction: -1 | 1) {
    if (unavailable || (direction < 0 && !canDecrease) || (direction > 0 && !canIncrease)) return;
    const next = value + direction * step;
    setDraft(String(next));
    onChange(next);
  }

  function commit() {
    if (!error && parsed !== value) onChange(parsed);
    setDraft(String(error ? value : parsed));
  }

  const decrementProps = canDecrease
    ? { disabled: false as const }
    : { disabled: true as const, disabledReason: `Minimum quantity is ${min}.` };
  const incrementProps = canIncrease
    ? { disabled: false as const }
    : { disabled: true as const, disabledReason: `Maximum quantity is ${max}.` };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-semibold text-charcoal">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => adjust(-1)}
          className="!h-10 !w-10 !px-0 text-h2"
          {...(unavailable
            ? { disabled: true as const, disabledReason: disabledReason ?? boundsError! }
            : decrementProps)}
        >
          −
        </Button>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          disabled={unavailable}
          aria-invalid={Boolean(error)}
          aria-describedby={error || disabledReason ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          className="h-10 min-w-16 flex-1 rounded-control border border-sand bg-white px-3 text-center text-body font-semibold tabular-nums text-charcoal outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand disabled:bg-cream"
        />
        <Button
          variant="secondary"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => adjust(1)}
          className="!h-10 !w-10 !px-0 text-h2"
          {...(unavailable
            ? { disabled: true as const, disabledReason: disabledReason ?? boundsError! }
            : incrementProps)}
        >
          +
        </Button>
      </div>
      {disabledReason || error ? (
        <p
          id={errorId}
          role={error && !disabledReason ? 'alert' : undefined}
          className="text-caption text-stone"
        >
          {disabledReason ?? error}
        </p>
      ) : !canDecrease ? (
        <p className="text-caption text-stone">Minimum quantity is {min}.</p>
      ) : !canIncrease ? (
        <p className="text-caption text-stone">Maximum quantity is {max}.</p>
      ) : null}
    </div>
  );
}
