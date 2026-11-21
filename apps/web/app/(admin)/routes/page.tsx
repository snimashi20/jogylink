import { RouteListResponseSchema } from '@jogylink/shared';
import type { ReactElement } from 'react';
import { requireUser } from '../../../lib/session';
import { apiGet } from '../../../lib/server-api';
import { RoutesView } from './routes-view';

export const metadata = { title: 'Routes · JogyLink' };

export default async function RoutesPage(): Promise<ReactElement | null> {
  const user = await requireUser();
  if (user.role !== 'owner') return null;

  const routes = await apiGet('/routes?page=1&pageSize=25&active=true', (value) =>
    RouteListResponseSchema.parse(value),
  );

  return <RoutesView initialRoutes={routes} />;
}
