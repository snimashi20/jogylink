import { Fragment } from 'react';
import { requireUser } from '../../lib/session';
import { DASHBOARD_WIDGETS } from '../../lib/dashboard-widgets';
import { parseRange, todayIso } from '../../lib/date-range';
import { PageFrame } from '../../components/page-frame';

export const metadata = { title: 'Dashboard · JogyLink' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== 'owner') return null;

  const today = todayIso();
  const range = parseRange(await searchParams, today);

  return (
    <PageFrame title="Dashboard" range={range} today={today}>
      {DASHBOARD_WIDGETS.map((w) => (
        <Fragment key={w.id}>{w.render(range)}</Fragment>
      ))}
    </PageFrame>
  );
}
