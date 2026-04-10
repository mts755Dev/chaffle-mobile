/**
 * Stripe Terminal Service
 *
 * Manages connection token fetching for the Stripe Terminal SDK.
 * All sensitive operations (token creation, payment intents) run on the backend.
 */

import { supabase } from './supabase/client';

/**
 * Fetch a short-lived connection token via Supabase Edge Function.
 * Called by StripeTerminalProvider whenever the SDK needs a new token.
 *
 * IMPORTANT: Never generate tokens on the client. Always fetch from backend.
 */
export async function fetchConnectionToken(stripeAccount?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    console.log('[StripeTerminal] Fetching connection token…', stripeAccount ? `(account: ${stripeAccount})` : '(platform)');

    const { data, error } = await supabase.functions.invoke(
      'terminal-connection-token',
      { body: { stripeAccount } },
    );

    if (error) {
      throw new Error(error.message || 'Connection token request failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.secret) {
      throw new Error('No secret returned from connection token endpoint');
    }

    console.log('[StripeTerminal] Connection token received');
    return data.secret;
  } catch (err: any) {
    const msg = err.name === 'AbortError'
      ? 'Connection token request timed out (15s)'
      : err.message || 'Failed to fetch connection token';
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
