import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** Which module's code fills this card, so people know who to ask. */
  owner?: string;
  /** Wide cards take two grid columns. */
  wide?: boolean;
} & (
  | { state?: 'ready'; children: ReactNode }
  | { state: 'empty'; children: ReactNode } // say what is missing and how to fix it
  | { state: 'error'; children: ReactNode } // say what failed and what to do
  | { state: 'not-built'; children?: never }
);

/**
 * One card on the dashboard. Every widget uses this, so they all look and fail the same way:
 *   ready      the numbers
 *   empty      nothing in this date range, with a sentence saying so
 *   error      the data could not load: this card says so, the rest of the page still works
 *   not-built  the owning module has not been built yet
 */
export function WidgetCard(props: Props) {
  const { title, owner, wide } = props;
  const state = props.state ?? 'ready';
  return (
    <section
      aria-label={title}
      className={`rounded-card border border-sand bg-white p-5 break-inside-avoid ${wide ? 'md:col-span-2 lg:col-span-3' : ''}`}
    >
      <h2 className="text-h3 font-bold text-charcoal">{title}</h2>
      <div className="mt-3">
        {state === 'not-built' ? (
          <p className="text-body text-stone">
            Not built yet{owner ? ` (${owner} adds this)` : ''}.
          </p>
        ) : state === 'error' ? (
          <p role="alert" className="text-body font-semibold text-alarm">
            {props.children}
          </p>
        ) : state === 'empty' ? (
          <p className="text-body text-stone">{props.children}</p>
        ) : (
          props.children
        )}
      </div>
    </section>
  );
}

/** A big number with a label, the usual widget body. */
export function BigNumber({ value, caption }: { value: string; caption?: string }) {
  return (
    <div>
      <p className="text-display font-bold text-charcoal">{value}</p>
      {caption ? <p className="text-caption text-stone">{caption}</p> : null}
    </div>
  );
}
