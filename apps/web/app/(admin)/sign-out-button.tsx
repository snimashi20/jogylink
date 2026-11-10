'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jogylink/ui';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch('/session', { method: 'DELETE' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <Button variant="secondary" loading={pending} loadingLabel="Signing out…" onClick={signOut}>
      Sign out
    </Button>
  );
}
