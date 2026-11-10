'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleSlash, Plus } from 'lucide-react';
import { Button, ConfirmDialog } from '@jogylink/ui';
import type { User } from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { AddUserDialog, EditUserDialog, ResetPasswordDialog, ROLE_LABEL } from './user-dialogs';

// Fixed time zone so the server and the browser always print the same date.
const date = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium' });

/** Screen A14: who can sign in, and as what. Owner only. */
export function UsersView({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function setActive(user: User, active: boolean, notify = true) {
    setNotice(null);
    try {
      await callApi('PATCH', `/users/${user.id}`, { active });
      router.refresh();
    } catch (err) {
      const why =
        err instanceof ApiError && err.status === 409
          ? err.message
          : err instanceof ApiError && err.status === 0
            ? err.message
            : 'Try again.';
      if (notify) {
        setNotice({
          kind: 'error',
          text: `Could not switch ${user.name} ${active ? 'on' : 'off'}. ${why}`,
        });
      }
      throw err;
    }
  }

  const saved = () => router.refresh();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold">Users</h1>
          <p className="mt-1 text-body text-stone">
            Owners use this website. Workers sign in on the POS app. Switching someone off locks
            them out at once and keeps their history.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" /> Add user
        </Button>
      </div>

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-control bg-white px-3 py-2 text-body ${notice.kind === 'error' ? 'text-alarm' : 'text-safe'}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-card border border-sand bg-white shadow-level-1">
        <table className="w-full text-left text-body">
          <caption className="sr-only">People who can sign in</caption>
          <thead className="border-b border-sand bg-cream text-caption font-semibold">
            <tr>
              <th scope="col" className="px-4 py-3">
                Name
              </th>
              <th scope="col" className="px-4 py-3">
                Username
              </th>
              <th scope="col" className="px-4 py-3">
                Role
              </th>
              <th scope="col" className="px-4 py-3">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                Added
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-sand last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    {u.name}
                    {isSelf ? (
                      <span className="ml-2 text-caption font-normal text-stone">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-caption">{u.username}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="inline-flex items-center gap-1 text-safe">
                        <CircleCheck aria-hidden className="size-4" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone">
                        <CircleSlash aria-hidden className="size-4" /> Switched off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone">{date(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        aria-label={`Edit ${u.name}`}
                        onClick={() => setEditing(u)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={`Reset password for ${u.name}`}
                        onClick={() => setResetting(u)}
                      >
                        Reset password
                      </Button>
                      {u.active ? (
                        isSelf ? (
                          <Button
                            variant="secondary"
                            disabled
                            disabledReason="You cannot switch off your own account"
                            aria-label={`Switch off ${u.name}`}
                          >
                            Switch off
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            aria-label={`Switch off ${u.name}`}
                            onClick={() => setDeactivating(u)}
                          >
                            Switch off
                          </Button>
                        )
                      ) : (
                        <Button
                          variant="secondary"
                          aria-label={`Switch on ${u.name}`}
                          onClick={() => setActive(u, true).catch(() => undefined)}
                        >
                          Switch on
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddUserDialog open={adding} onOpenChange={setAdding} onSaved={saved} />
      <EditUserDialog
        user={editing}
        isSelf={editing?.id === currentUserId}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={saved}
      />
      <ResetPasswordDialog
        user={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onDone={(u) =>
          setNotice({
            kind: 'ok',
            text: `Password changed for ${u.name}. Tell them the new one in person.`,
          })
        }
      />
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        confirmLabel="Switch off"
        message={`${deactivating?.name ?? 'This person'} will be signed out and cannot sign in again until you switch them back on. Their history is kept.`}
        describeError={(err) => (err instanceof ApiError && err.message ? err.message : undefined)}
        onConfirm={async () => {
          if (deactivating) await setActive(deactivating, false, false);
        }}
      />
    </main>
  );
}
