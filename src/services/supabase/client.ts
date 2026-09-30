import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../constants';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

function buildAuthedClient(): SupabaseClient {
  const url = SUPABASE_URL?.trim();
  const key = SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    console.warn('Supabase credentials missing — auth will be unavailable');
    return createClient('https://placeholder.supabase.co', 'placeholder', {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createClient(url, key, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Public catalogue / buyer checkout client (no user JWT).
 *
 * Uses in-memory auth storage so a signed-in admin session on `supabase`
 * can never leak onto this client (SecureStore / AsyncStorage share risks).
 */
function buildPublicClient(): SupabaseClient {
  const url = SUPABASE_URL?.trim();
  const key = SUPABASE_ANON_KEY?.trim();
  const memoryStorage = {
    getItem: async (_k: string) => null as string | null,
    setItem: async (_k: string, _v: string) => {},
    removeItem: async (_k: string) => {},
  };
  if (!url || !key) {
    return createClient('https://placeholder.supabase.co', 'placeholder', {
      auth: {
        storageKey: 'chaffle-public-anon',
        storage: memoryStorage,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return createClient(url, key, {
    auth: {
      // Unique key so this client never shares GoTrue in-memory session
      // with the signed-in `supabase` client (same default storageKey = leak).
      storageKey: 'chaffle-public-anon',
      storage: memoryStorage,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Authenticated client — JWT attached (writes, private rows, edge invokes). */
export const supabase = buildAuthedClient();
/** Public catalogue reads — never attach the user JWT. */
export const supabasePublic = buildPublicClient();
export default supabase;
