import { ShopListResponseSchema } from '@jogylink/shared';
import type { ReactElement } from 'react';
import { requireUser } from '../../../lib/session';
import { apiGet } from '../../../lib/server-api';
import { ShopsView } from './shops-view';

export const metadata = { title: 'Shops · JogyLink' };

export default async function ShopsPage(): Promise<ReactElement | null> {
  const user = await requireUser();
  // The admin layout gives workers an owner-only message; do not request owner data for them.
  if (user.role !== 'owner') return null;

  const shops = await apiGet('/shops?page=1&pageSize=25&active=true', (value) =>
    ShopListResponseSchema.parse(value),
  );

  return <ShopsView initialShops={shops} />;
}
