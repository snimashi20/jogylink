import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { auth } from './index';
import type { AuthController } from './controller';
import type { AuthState } from './types';

const Context = createContext<AuthController>(auth);

export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void auth.start();
  }, []);
  return <Context.Provider value={auth}>{children}</Context.Provider>;
}

/** The current sign-in state, plus the actions. Re-renders when the state changes. */
export function useAuth(): { state: AuthState } & Pick<
  AuthController,
  'signIn' | 'signOut' | 'verify'
> {
  const controller = useContext(Context);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return {
    state,
    signIn: controller.signIn.bind(controller),
    signOut: controller.signOut.bind(controller),
    verify: controller.verify.bind(controller),
  };
}
