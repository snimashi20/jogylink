'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField } from '@jogylink/ui';

/** Messages say what went wrong and how to fix it (UI Design Guide, forms). */
const MESSAGES = {
  401: 'That username or password is not right. Check them and try again.',
  429: 'Too many wrong attempts. Wait 15 minutes, then try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  other: 'Something went wrong on our side. Try again in a moment.',
} as const;

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const missing = username.trim() === '' || password === '';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (missing || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(res.status === 401 || res.status === 429 ? MESSAGES[res.status] : MESSAGES.other);
    } catch {
      setError(MESSAGES.network);
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error ?? undefined}
      />
      {missing ? (
        <Button type="submit" disabled disabledReason="Enter your username and password">
          Sign in
        </Button>
      ) : (
        <Button type="submit" loading={pending} loadingLabel="Signing in…">
          Sign in
        </Button>
      )}
    </form>
  );
}
