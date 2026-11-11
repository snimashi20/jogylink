import type { AuthApi, AuthState, LoginResult, SessionStorage } from './types';

export const SESSION_ENDED = 'Your session ended. Sign in again to carry on.';

export interface AuthControllerOptions {
  storage: SessionStorage;
  api: AuthApi;
  /**
   * M6 plugs in here. Return a sentence to BLOCK signing out (for example "3 sales have not been
   * sent yet"), or null to allow it. Signing out must never silently lose unsynced sales.
   */
  guardSignOut?: () => Promise<string | null>;
}

/**
 * The POS sign-in rules, with no React and no phone code in it, so they can be tested.
 *
 * The van is often offline, so the rules are built around that:
 *  - Signing IN needs the server. Nothing else can prove who you are.
 *  - After that the app works without signal: the session is kept on the phone, and a launch
 *    with no signal opens straight into the app.
 *  - Being unable to reach the server NEVER signs you out. Only the server saying "no" does
 *    (expired login, or the owner switched the account off).
 */
export class AuthController {
  private state: AuthState = { status: 'loading' };
  private listeners = new Set<() => void>();

  constructor(private readonly options: AuthControllerOptions) {}

  getState = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: AuthState): void {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  /** Call once when the app opens. Resolves after the background check with the server. */
  async start(): Promise<void> {
    const stored = await this.options.storage.load().catch(() => null);
    if (!stored) return this.set({ status: 'signed-out' });

    // Open straight into the app: no waiting for a network that may not exist.
    this.set({
      status: 'signed-in',
      user: stored.user,
      token: stored.token,
      verification: 'pending',
    });
    await this.verify();
  }

  /** Asks the server whether the saved login is still good. Safe to call again any time. */
  async verify(): Promise<void> {
    const current = this.state;
    if (current.status !== 'signed-in') return;

    const result = await this.options.api.check(current.token);
    // The person may have signed out, or in as someone else, while we waited.
    if (this.state.status !== 'signed-in' || this.state.token !== current.token) return;

    if (result.kind === 'rejected') return this.endSession(SESSION_ENDED);
    if (result.kind === 'offline') {
      return this.set({ ...this.state, verification: 'offline' });
    }
    // The server is the authority on the role and the name, so take its copy.
    await this.options.storage
      .save({ token: current.token, user: result.user })
      .catch(() => undefined);
    this.set({
      status: 'signed-in',
      user: result.user,
      token: current.token,
      verification: 'verified',
    });
  }

  async signIn(username: string, password: string): Promise<LoginResult> {
    const result = await this.options.api.login(username.trim().toLowerCase(), password);
    if (!result.ok) return result;
    await this.options.storage.save({ token: result.token, user: result.user });
    this.set({
      status: 'signed-in',
      user: result.user,
      token: result.token,
      verification: 'verified',
    });
    return result;
  }

  /** Returns null when signed out, or a sentence saying why it was blocked. */
  async signOut(): Promise<string | null> {
    const blocked = await this.options.guardSignOut?.();
    if (blocked) return blocked;
    await this.endSession();
    return null;
  }

  /**
   * Other modules call this when ANY server request comes back 401. It means the login is no
   * longer valid, so go back to the sign-in screen with a clear message.
   */
  async handleUnauthorized(): Promise<void> {
    if (this.state.status === 'signed-in') await this.endSession(SESSION_ENDED);
  }

  /** The login token for server requests, or null when signed out. */
  getToken(): string | null {
    return this.state.status === 'signed-in' ? this.state.token : null;
  }

  private async endSession(notice?: string): Promise<void> {
    await this.options.storage.clear().catch(() => undefined);
    this.set({ status: 'signed-out', notice });
  }
}
