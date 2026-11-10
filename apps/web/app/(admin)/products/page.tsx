import { ProductSchema, SettingSchema } from '@jogylink/shared';
import { z } from 'zod';
import { requireUser } from '../../../lib/session';
import { apiGet } from '../../../lib/server-api';
import { ProductsView } from './products-view';

export const metadata = { title: 'Products · JogyLink' };

export default async function ProductsPage() {
  const user = await requireUser();
  // The layout shows workers an owner-only notice; do not even ask the API for products.
  if (user.role !== 'owner') return null;

  const [products, settings] = await Promise.all([
    apiGet('/products', (v) => z.array(ProductSchema).parse(v)),
    apiGet('/settings', (v) => z.array(SettingSchema).parse(v)),
  ]);
  const markup = settings.find((s) => s.key === 'retail_markup')?.value;

  return (
    <ProductsView
      products={products}
      defaultMarkup={typeof markup === 'number' ? markup : Number(markup) || 1.1}
    />
  );
}
