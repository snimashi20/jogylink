import type { ReactNode } from 'react';
import { WidgetCard } from '../components/widget-card';
import type { DateRange } from './date-range';

/** Same idea as dashboard-widgets.tsx: each member replaces their placeholder with a real section. */
export interface ReportSection {
  id: string;
  title: string;
  owner: string;
  render: (range: DateRange) => ReactNode;
}

const comingSoon = (id: string, title: string, owner: string): ReportSection => ({
  id,
  title,
  owner,
  render: () => <WidgetCard title={title} owner={owner} state="not-built" wide />,
});

export const REPORT_SECTIONS: ReportSection[] = [
  comingSoon('purchase-by-supplier', 'Purchase cost by supplier', 'M2'),
  comingSoon('wastage', 'Wastage and seasonal comparison', 'M3'),
  comingSoon('route-performance', 'Route performance', 'M4'),
  comingSoon('sellers-and-profit', 'Best and worst sellers, profit per product', 'M5'),
  comingSoon('credit-ageing', 'Credit ageing', 'M6'),
  comingSoon('unrecovered-claims', 'Loss from unrecovered claims', 'M7'),
];
