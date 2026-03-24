import apiClient from './client';
import { API_BASE_URL } from '../../constants';

/**
 * Stripe API calls
 * These hit the Next.js API routes which handle Stripe operations server-side
 */
export const stripeApi = {
  /**
   * Create a checkout session for ticket purchase
   * The web app uses server actions, so we call the equivalent API route
   */
  createPaymentIntent: async (params: {
    amount: number;
    quantity: number;
    email: string;
    ticketId: string;
    raffleAccount: string;
    isApplicationAmount?: boolean;
  }) => {
    // This hits a custom API route on the Next.js backend
    const response = await apiClient.post('/api/stripe/create-payment-intent', params);
    return response.data;
  },

  /**
   * Confirm payment success (mark ticket as paid)
   */
  confirmPaymentSuccess: async (ticketId: string) => {
    const response = await apiClient.get(`/api/stripe/payment/${ticketId}/success`);
    return response.data;
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
  createTerminalConnectionToken: async (locationId?: string) => {
    const response = await apiClient.post('/api/terminal/connection-token', {
      location_id: locationId,
    });
    return response.data as { secret: string };
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
    const response = await apiClient.post('/api/terminal/create-payment-intent', params);
    return response.data as {
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
  captureTerminalPayment: async (paymentIntentId: string, stripeAccount?: string) => {
    const response = await apiClient.post('/api/terminal/capture-payment', {
      paymentIntentId,
      stripeAccount,
    });
    return response.data as { id: string; status: string; amount: number };
  },

  /**
   * Cancel an in-progress Terminal PaymentIntent
   */
  cancelTerminalPayment: async (paymentIntentId: string, stripeAccount?: string) => {
    const response = await apiClient.post('/api/terminal/cancel-payment', {
      paymentIntentId,
      stripeAccount,
    });
    return response.data as { id: string; status: string };
  },
};
