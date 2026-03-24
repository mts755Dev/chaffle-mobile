/**
 * Stripe Terminal Service
 *
 * Manages connection token fetching for the Stripe Terminal SDK.
 * All sensitive operations (token creation, payment intents) run on the backend.
 */

import { API_BASE_URL } from '../constants';
import { supabase } from './supabase/client';

/**
 * Fetch a short-lived connection token from the backend.
 * Called by StripeTerminalProvider whenever the SDK needs a new token.
 *
 * IMPORTANT: Never generate tokens on the client. Always fetch from backend.
 */
export async function fetchConnectionToken(): Promise<string> {
  let authHeader: Record<string, string> = {};
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // No session — proceed without auth
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/terminal/connection-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody.error || `Connection token request failed (${response.status})`
      );
    }

    const data = await response.json();

    if (!data.secret) {
      throw new Error('No secret returned from connection token endpoint');
    }

    return data.secret;
  } catch (error: any) {
    const msg = error.name === 'AbortError'
      ? 'Connection token request timed out'
      : error.message || 'Failed to fetch connection token';
    console.error('[StripeTerminal] Failed to fetch connection token:', msg);
    throw new Error(msg);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Structured logging for terminal events.
 */
export const terminalLog = {
  discovery: (msg: string, data?: any) => {
    console.log(`[Terminal:Discovery] ${msg}`, data ?? '');
  },
  connection: (msg: string, data?: any) => {
    console.log(`[Terminal:Connection] ${msg}`, data ?? '');
  },
  payment: (msg: string, data?: any) => {
    console.log(`[Terminal:Payment] ${msg}`, data ?? '');
  },
  error: (msg: string, error?: any) => {
    console.error(`[Terminal:Error] ${msg}`, error ?? '');
  },
};
