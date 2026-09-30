import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

type InvokeBody = Record<string, unknown>;

function isAccessTokenStale(session: Session, skewSeconds = 60): boolean {
  const expiresAt = session.expires_at;
  if (!expiresAt) return false;
  return expiresAt * 1000 <= Date.now() + skewSeconds * 1000;
}

async function getValidSession(): Promise<Session> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || 'Failed to read session');
  }

  let session = sessionData.session;
  if (!session?.access_token) {
    throw new Error('Not signed in');
  }

  if (isAccessTokenStale(session)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session?.access_token) {
      throw new Error('Session expired — please sign in again');
    }
    session = refreshData.session;
  }

  return session;
}

async function parseInvokeError(error: unknown, fallback: string): Promise<string> {
  let message = fallback;
  if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message?: string }).message || fallback);
  }

  const context = (error as { context?: Response })?.context;
  if (context) {
    try {
      const clone =
        typeof context.clone === 'function' ? context.clone() : context;
      const payload = await clone.json();
      message = payload?.error || payload?.message || message;
    } catch {
      try {
        const clone =
          typeof context.clone === 'function' ? context.clone() : context;
        const text = await clone.text();
        if (text?.trim()) {
          try {
            const payload = JSON.parse(text);
            message = payload?.error || payload?.message || text;
          } catch {
            message = text.slice(0, 300);
          }
        }
      } catch {
        // Keep parsed message when response body cannot be read.
      }
    }
  }

  // Prefer concrete edge JSON error over the generic FunctionsHttpError text.
  if (
    /edge function returned a non-2xx/i.test(message) &&
    fallback &&
    fallback !== message
  ) {
    // keep message if we already replaced it from body; otherwise leave as-is
  }

  return message;
}

function isJwtAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('invalid jwt') || normalized.includes('jwt expired');
}

export async function invokeEdgeFunction<T>(
  functionName: string,
  body: InvokeBody,
  fallbackError = 'Request failed',
): Promise<T> {
  const invoke = async (session: Session) =>
    supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

  let session = await getValidSession();
  let { data, error } = await invoke(session);

  if (error) {
    const message = await parseInvokeError(error, fallbackError);
    if (isJwtAuthError(message)) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        session = refreshData.session;
        ({ data, error } = await invoke(session));
      }
    }
  }

  if (error) {
    throw new Error(await parseInvokeError(error, fallbackError));
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }

  return data as T;
}
