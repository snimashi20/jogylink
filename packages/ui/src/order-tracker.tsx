import { Check, CircleAlert } from 'lucide-react';

/**
 * C19 — Order Tracker (public website W6/W7 and admin A8, M8).
 *
 * Shows how far an order has got, e.g.
 *   Confirmed ✓ — Packed ✓ — With courier (now) — In transit — Delivered
 *
 *  - Done steps: green tick. Current step: brand colour, marked for screen readers.
 *    Later steps: grey. Status is never shown by colour alone: there is always an icon or text.
 *  - An exception (Cancelled, Delivery failed, Returned) is shown as a banner with an icon,
 *    a title and a short message, and the steps stop at the last step that was reached.
 *
 * The component knows nothing about order statuses: the page maps its statuses to `steps`,
 * `currentKey` and `exception`, so the same tracker can show any linear process.
 */
export type OrderTrackerStep = {
  key: string;
  label: string;
  /** Optional short time shown under the label, e.g. "27 Nov, 10:30". */
  time?: string;
};

export type OrderTrackerException = {
  title: string;
  message?: string;
  /** alarm = cancelled / returned. act = needs action, e.g. a failed delivery being re-tried. */
  tone?: 'alarm' | 'act';
};

export type OrderTrackerProps = {
  steps: OrderTrackerStep[];
  /** Key of the step the order is on now (the last step reached). */
  currentKey: string;
  exception?: OrderTrackerException;
  className?: string;
};

export function OrderTracker({ steps, currentKey, exception, className }: OrderTrackerProps) {
  const currentIndex = steps.findIndex((step) => step.key === currentKey);
  const lastIndex = steps.length - 1;
  // The final step counts as done when the order is on it (e.g. Delivered).
  const isComplete = !exception && currentIndex === lastIndex;

  return (
    <div className={className}>
      {exception && (
        <div
          role="status"
          className={[
            'mb-4 flex items-start gap-2 rounded-card border p-3',
            exception.tone === 'act'
              ? 'border-act bg-act/10 text-charcoal'
              : 'border-alarm bg-alarm/10 text-alarm',
          ].join(' ')}
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-body font-semibold">{exception.title}</p>
            {exception.message && <p className="text-caption">{exception.message}</p>}
          </div>
        </div>
      )}

      <ol aria-label="Order progress" className="flex flex-col gap-3 sm:flex-row sm:gap-0">
        {steps.map((step, index) => {
          const done = index < currentIndex || (index === currentIndex && isComplete);
          const current = index === currentIndex && !isComplete;
          const stateText = done ? 'done' : current ? 'current step' : 'not yet';

          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className="flex items-center gap-2 sm:flex-1 sm:flex-col sm:text-center"
            >
              <span
                aria-hidden="true"
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-caption font-semibold',
                  done
                    ? 'border-safe bg-safe text-white'
                    : current
                      ? 'border-brand bg-white text-brand-deep'
                      : 'border-sand bg-white text-stone',
                ].join(' ')}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="flex flex-col">
                <span
                  className={[
                    'text-body',
                    current ? 'font-semibold text-charcoal' : done ? 'text-charcoal' : 'text-stone',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                {step.time && <span className="text-caption text-stone">{step.time}</span>}
                <span className="sr-only">({stateText})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
