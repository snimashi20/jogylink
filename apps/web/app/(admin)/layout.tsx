import type { ReactNode } from 'react';
import { requireUser } from '../../lib/session';
import { AdminNav } from './admin-nav';
import { SignOutButton } from './sign-out-button';

/**
 * Everything in this route group needs a signed-in OWNER. The web admin is the owner's tool;
 * workers use the POS app. The API enforces roles on its own too: this only decides what to show.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div>
      <header className="flex items-center justify-between bg-brand px-6 py-3 print:hidden">
        <div className="flex items-center gap-8">
          <span className="text-h2 font-bold tracking-tight text-white uppercase">JogyLink</span>
          {user.role === 'owner' ? <AdminNav /> : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-body text-white">
            {user.name} <span className="text-caption opacity-80">({user.role})</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      {user.role === 'owner' ? (
        children
      ) : (
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-h1 font-bold">This area is for the owner</h1>
          <p className="mt-2 text-body text-stone">
            Workers use the JogyLink POS app. Sign out and ask the owner if you need access here.
          </p>
        </main>
      )}
    </div>
  );
}
