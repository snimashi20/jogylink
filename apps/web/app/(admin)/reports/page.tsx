import { Fragment } from 'react';
import { requireUser } from '../../../lib/session';
import { REPORT_SECTIONS } from '../../../lib/report-sections';
import { parseRange, todayIso } from '../../../lib/date-range';
import { PageFrame } from '../../../components/page-frame';
import { PrintButton } from './print-button';

export const metadata = { title: 'Reports · JogyLink' };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== 'owner') return null;

  const today = todayIso();
  const range = parseRange(await searchParams, today);

  return (
    <PageFrame title="Reports" range={range} today={today} actions={<PrintButton />}>
      {REPORT_SECTIONS.map((s) => (
        <Fragment key={s.id}>{s.render(range)}</Fragment>
      ))}
    </PageFrame>
  );
}
