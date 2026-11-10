import { UserSchema } from '@jogylink/shared';
import { z } from 'zod';
import { requireUser } from '../../../lib/session';
import { apiGet } from '../../../lib/server-api';
import { UsersView } from './users-view';

export const metadata = { title: 'Users · JogyLink' };

export default async function UsersPage() {
  const me = await requireUser();
  // The layout shows workers an owner-only notice; do not even ask the API for the user list.
  if (me.role !== 'owner') return null;

  const users = await apiGet('/users', (v) => z.array(UserSchema).parse(v));
  return <UsersView users={users} currentUserId={me.id} />;
}
