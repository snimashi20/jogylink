import type { User } from '@jogylink/shared';

/** What is kept on the phone between app launches. */
export interface StoredSession {
  token: string;
  user: User;
}

/** Where the session is kept. The real one is the phone's secure store; tests use memory. */
export interface SessionStorage {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export type LoginFailure = 'invalid' | 'locked' | 'offline' | 'server';
export type LoginResult =
  { ok: true; token: string; user: User } | { ok: false; reason: LoginFailure };

/** The server's answer when we ask "is this still a valid login?". */
export type CheckResult =
  | { kind: 'valid'; user: User }
  | { kind: 'rejected' } // token expired, or the account was switched off
  | { kind: 'offline' }; // no signal: this says nothing about the login

export interface AuthApi {
  login(username: string, password: string): Promise<LoginResult>;
  check(token: string): Promise<CheckResult>;
}

/** Did the last check with the server work? Only meaningful while signed in. */
export type Verification = 'pending' | 'verified' | 'offline';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; user: User; token: string; verification: Verification };
