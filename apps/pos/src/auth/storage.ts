import * as SecureStore from 'expo-secure-store';
import { UserSchema } from '@jogylink/shared';
import { z } from 'zod';
import type { SessionStorage, StoredSession } from './types';

const KEY = 'jogylink.session';
const StoredSchema = z.object({ token: z.string().min(1), user: UserSchema });

/**
 * The login lives in the phone's secure store (Android Keystore), not in plain storage, so
 * another app or a copied backup cannot read it.
 */
export const secureSessionStorage: SessionStorage = {
  async load(): Promise<StoredSession | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      const parsed = StoredSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null; // a damaged value means "signed out", not a crash
    } catch {
      return null;
    }
  },
  async save(session) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};
