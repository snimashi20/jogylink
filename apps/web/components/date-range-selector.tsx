'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button, FormField } from '@jogylink/ui';
import { PRESETS, customRangeProblem, rangeToQuery, type DateRange } from '../lib/date-range';

interface Props {
  value: DateRange;
  /** Today in the business time zone. Passed in from the server so both sides agree. */
  today: string;
}

/** The range picker for A1 and A12. Choosing a range changes the address and the page reloads. */
export function DateRangeSelector({ value, today }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(value.range === 'custom' ? value.from : '');
  const [to, setTo] = useState(value.range === 'custom' ? value.to : '');
  const [showCustom, setShowCustom] = useState(value.range === 'custom');
  const [tried, setTried] = useState(false);

  const problem = customRangeProblem(from, to, today);

  function go(next: DateRange) {
    router.push(`${pathname}?${rangeToQuery(next)}`);
  }

  function applyCustom() {
    setTried(true);
    if (problem) return;
    go({ range: 'custom', from, to });
  }

  return (
    <div className="print:hidden">
      <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const current = value.range === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={current}
              onClick={() => {
                setShowCustom(false);
                router.push(`${pathname}?range=${p.id}`);
              }}
              className={
                current
                  ? 'h-9 rounded-control bg-charcoal px-4 text-body font-semibold text-white'
                  : 'h-9 rounded-control border border-charcoal bg-white px-4 text-body font-semibold text-charcoal hover:bg-cream'
              }
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={value.range === 'custom' || showCustom}
          aria-expanded={showCustom}
          onClick={() => setShowCustom((s) => !s)}
          className={
            value.range === 'custom'
              ? 'h-9 rounded-control bg-charcoal px-4 text-body font-semibold text-white'
              : 'h-9 rounded-control border border-charcoal bg-white px-4 text-body font-semibold text-charcoal hover:bg-cream'
          }
        >
          Custom
        </button>
      </div>

      {showCustom ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
          className="mt-3 flex flex-wrap items-start gap-3"
        >
          <FormField
            label="From"
            type="date"
            max={today}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <FormField
            label="To"
            type="date"
            max={today}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={tried && problem ? problem : undefined}
          />
          <div className="pt-[26px]">
            <Button type="submit">Apply</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
