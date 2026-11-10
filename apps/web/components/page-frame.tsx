import type { ReactNode } from 'react';
import { DateRangeSelector } from './date-range-selector';
import { describeRange, type DateRange } from '../lib/date-range';

interface Props {
  title: string;
  range: DateRange;
  today: string;
  /** Extra controls on the right of the heading (for example the export button). */
  actions?: ReactNode;
  children: ReactNode;
}

/** The shared frame: heading, date range, and a grid for the cards. */
export function PageFrame({ title, range, today, actions, children }: Props) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold">{title}</h1>
          <p className="mt-1 text-body text-stone">Showing {describeRange(range)}</p>
        </div>
        {actions}
      </div>
      <div className="mt-4">
        <DateRangeSelector value={range} today={today} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 print:block print:space-y-4">
        {children}
      </div>
    </main>
  );
}
