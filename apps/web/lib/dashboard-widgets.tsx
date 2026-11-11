import type { ReactNode } from 'react';
import { WidgetCard } from '../components/widget-card';
import type { DateRange } from './date-range';

/**
 * THE DASHBOARD (A1) AND REPORTS (A12) SHARE THIS PATTERN. To add your widget:
 *   1. Build an async server component that fetches your numbers and renders a <WidgetCard>.
 *      Catch your own errors and return <WidgetCard state="error"> so one failure cannot
 *      take down the whole page.
 *   2. Replace your placeholder entry below with  render: (range) => <MyWidget range={range} />
 * The frame (grid, date range, page) is M1's and should not need changes.
 */
export interface DashboardWidget {
  id: string;
  title: string;
  owner: string;
  render: (range: DateRange) => ReactNode;
}

const comingSoon = (id: string, title: string, owner: string): DashboardWidget => ({
  id,
  title,
  owner,
  render: () => <WidgetCard title={title} owner={owner} state="not-built" />,
});

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  comingSoon('todays-sales', "Today's sales", 'M5'),
  comingSoon('cash-collected', 'Cash collected', 'M5'),
  comingSoon('expiring-soon', 'Expiring soon', 'M3'),
  comingSoon('below-reorder', 'Below reorder level', 'M3'),
  comingSoon('stock-value', 'Stock value on hand', 'M2'),
  comingSoon('stock-split', 'Stock: store and van', 'M4'),
  comingSoon('outstanding-credit', 'Outstanding credit', 'M6'),
  comingSoon('overdue-accounts', 'Overdue accounts', 'M6'),
  comingSoon('returns-awaiting-claim', 'Returns awaiting claim', 'M7'),
  comingSoon('quarantine-value', 'Value in quarantine', 'M7'),
];
