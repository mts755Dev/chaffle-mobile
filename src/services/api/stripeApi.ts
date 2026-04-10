import apiClient from './client';
import { supabase } from '../supabase/client';
import { API_BASE_URL } from '../../constants';

/**
 * Stripe API calls
 * Payment-critical operations use Supabase Edge Functions (server-side, secure).
 * Admin/Terminal operations use the Next.js API routes.
 */
export const stripeApi = {
  /**
   * Create a PaymentIntent for ticket purchase via Supabase Edge Function.
   * The Edge Function keeps the Stripe secret key server-side.
   */
  createPaymentIntent: async (params: {
    amount: number;
    quantity: number;
    email: string;
    ticketId: string;
    raffleAccount: string;
    isApplicationAmount?: boolean;
  }) => {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: params,
    });

    if (error) throw new Error(error.message || 'Failed to create payment intent');
    if (data?.error) throw new Error(data.error);
    return data as { clientSecret: string; id: string };
  },

  /**
   * Confirm payment success — mark ticket as paid directly in the database.
   */
  confirmPaymentSuccess: async (ticketId: string) => {
    const { error } = await supabase
      .from('ticket')
      .update({ paid: true })
      .eq('id', ticketId);
    if (error) throw error;
    return { success: true };
  },

  /**
   * Send purchase confirmation email to the buyer via Edge Function.
   * Fire-and-forget — should not block the payment success flow.
   */
  sendPurchaseEmail: async (params: {
    email: string;
    quantity: number;
    ticketNumber: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('send-purchase-email', {
      body: params,
    });
    if (error) throw new Error(error.message || 'Failed to send confirmation email');
    if (data?.error) throw new Error(data.error);
    return data;
  },

  /**
   * Verify Stripe account (after onboarding)
   */
  verifyStripeAccount: async (stripeAccountId: string) => {
    const response = await apiClient.get(`/api/stripe/account/${stripeAccountId}/verify`);
    return response.data;
  },

  /**
   * Create Stripe Connect account for a raffle (admin)
   */
  createStripeAccount: async (donationId: string) => {
    const response = await apiClient.post('/api/stripe/create-account', { donationId });
    return response.data;
  },

  /**
   * Create Stripe Connect account link (admin)
   */
  createStripeAccountLink: async (clientId: string) => {
    const response = await apiClient.post('/api/stripe/create-account-link', { clientId });
    return response.data;
  },

  /**
   * Retrieve Stripe account details (admin)
   */
  retrieveAccountDetails: async (clientId: string) => {
    const response = await apiClient.get(`/api/stripe/account/${clientId}/details`);
    return response.data;
  },

  /**
   * Refresh Stripe account status (admin)
   */
  refreshStripeAccountStatus: async (stripeAccountId: string, raffleId: string) => {
    const response = await apiClient.post('/api/stripe/refresh-account-status', {
      stripeAccountId,
      raffleId,
    });
    return response.data;
  },

  /**
   * Create Terminal connection token (admin - in person payments)
   */
  createTerminalConnectionToken: async (_locationId?: string) => {
    const { data, error } = await supabase.functions.invoke('terminal-connection-token', {
      body: {},
    });
    if (error) throw new Error(error.message || 'Failed to create connection token');
    if (data?.error) throw new Error(data.error);
    return data as { secret: string };
  },

  /**
   * Get or create a default Stripe Terminal Location via Edge Function.
   * Required for Bluetooth reader connections.
   */
  getOrCreateTerminalLocation: async (stripeAccount?: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-terminal-location', {
      body: { stripeAccount },
    });

    if (error) throw new Error(error.message || 'Failed to get terminal location');
    if (data?.error) throw new Error(data.error);
    return data.locationId;
  },

  // ── Stripe Terminal endpoints ────────────────────────────────────

  /**
   * Create a card_present PaymentIntent for Terminal in-person payment
   */
  createTerminalPaymentIntent: async (params: {
    amount: number;
    description?: string;
    metadata?: Record<string, string>;
    stripeAccount?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('terminal-payment-intent', {
      body: { action: 'create', ...params },
    });
    if (error) throw new Error(error.message || 'Failed to create terminal payment intent');
    if (data?.error) throw new Error(data.error);
    return data as {
      id: string;
      client_secret: string;
      status: string;
      amount: number;
      currency: string;
    };
  },

  /**
   * Capture a previously authorized Terminal PaymentIntent
   */
  captureTerminalPayment: async (paymentIntentId: string, _stripeAccount?: string) => {
    const { data, error } = await supabase.functions.invoke('terminal-payment-intent', {
      body: { action: 'capture', paymentIntentId },
    });
    if (error) throw new Error(error.message || 'Failed to capture terminal payment');
    if (data?.error) throw new Error(data.error);
    return data as { id: string; status: string; amount: number };
  },

  /**
   * Cancel an in-progress Terminal PaymentIntent
   */
  cancelTerminalPayment: async (paymentIntentId: string, _stripeAccount?: string) => {
    const { data, error } = await supabase.functions.invoke('terminal-payment-intent', {
      body: { action: 'cancel', paymentIntentId },
    });
    if (error) throw new Error(error.message || 'Failed to cancel terminal payment');
    if (data?.error) throw new Error(data.error);
    return data as { id: string; status: string };
  },
};
