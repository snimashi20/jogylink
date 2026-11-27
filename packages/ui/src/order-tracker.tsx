import { Check, CircleX, TriangleAlert } from 'lucide-react';

/**
 * C19 — Order Tracker (UI Design Guide, sections 5 and 6.8; website W6/W7, admin A8).
 *
 * A horizontal stepper:
 *   (✓)----(✓)----(✓)----(3)----( )----( )
 *   New    Conf   Pack  Courier Transit Deliv
 *   Current: Handed to courier
 *
 *  - Completed steps: Fresh Green with a tick. Current step: Bucket Red, so the customer's eye
 *    lands on where the parcel is. Later steps: Light Sand outline.
 *  - Never colour alone: each step also has a tick, a number or plain text, and the current step
 *    is written out in a "Current:" line.
 *  - An exception (Cancelled, Delivery failed, Returned) is a banner with a shape icon and text:
 *    alarm (Danger Crimson, cross) or act (Act Orange, filled triangle).
 *
 * The component knows nothing about order statuses: the page maps its statuses to `steps`,
 * `currentKey` and `exception`.
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
  /** alarm = cancelled / returned (default). act = needs action, e.g. a failed delivery. */
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
  const currentStep = steps[currentIndex];
  const isAct = exception?.tone === 'act';
  const ExceptionIcon = isAct ? TriangleAlert : CircleX;

  return (
    <div className={className}>
      {exception && (
        <div
          role="status"
          className={[
            'mb-4 flex items-start gap-2 rounded-card border p-3',
            isAct ? 'border-act bg-act/10 text-charcoal' : 'border-alarm bg-alarm/10 text-alarm',
          ].join(' ')}
        >
          <ExceptionIcon
            className={['mt-0.5 h-5 w-5 shrink-0', isAct ? 'fill-act text-white' : ''].join(' ')}
            aria-hidden="true"
          />
          <div>
            <p className="text-body font-semibold">{exception.title}</p>
            {exception.message && <p className="text-caption">{exception.message}</p>}
          </div>
        </div>
      )}

      <ol aria-label="Order progress" className="flex">
        {steps.map((step, index) => {
          const done = index < currentIndex || (index === currentIndex && isComplete);
          const current = index === currentIndex && !isComplete;
          const stateText = done ? 'done' : current ? 'current step' : 'not yet';

          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className="relative flex flex-1 flex-col items-center text-center"
            >
              {/* Connector line to the previous step: green once this step has been reached. */}
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={[
                    'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    done || current ? 'bg-safe' : 'bg-sand',
                  ].join(' ')}
                />
              )}
              <span
                aria-hidden="true"
                className={[
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-safe bg-safe text-white'
                    : current
                      ? 'border-brand bg-brand text-h3 font-bold text-white'
                      : 'border-sand bg-white text-caption text-stone',
                ].join(' ')}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={[
                  'mt-1 text-caption',
                  current ? 'font-semibold text-charcoal' : done ? 'text-charcoal' : 'text-stone',
                ].join(' ')}
              >
                {step.label}
              </span>
              {step.time && <span className="text-caption text-stone">{step.time}</span>}
              <span className="sr-only">({stateText})</span>
            </li>
          );
        })}
      </ol>

      {currentStep && (
        <p className="mt-3 text-body text-charcoal">
          <span className="font-semibold">{isComplete ? 'Completed:' : 'Current:'}</span>{' '}
          {currentStep.label}
        </p>
      )}
    </div>
  );
}
