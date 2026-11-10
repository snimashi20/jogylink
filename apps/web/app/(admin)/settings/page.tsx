import { SettingSchema } from '@jogylink/shared';
import { z } from 'zod';
import { requireUser } from '../../../lib/session';
import { apiGet } from '../../../lib/server-api';
import { SettingsView } from './settings-view';

export const metadata = { title: 'Settings · JogyLink' };

export default async function SettingsPage() {
  const me = await requireUser();
  // The layout shows workers an owner-only notice; do not even ask the API for settings.
  if (me.role !== 'owner') return null;

  const settings = await apiGet('/settings', (v) => z.array(SettingSchema).parse(v));
  return <SettingsView settings={settings} />;
}
