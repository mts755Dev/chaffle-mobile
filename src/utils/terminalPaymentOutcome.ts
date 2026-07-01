import type { TerminalPaymentOutcome } from '../types';

export function classifyTerminalPaymentError(
  error: unknown,
): { outcome: TerminalPaymentOutcome; message: string } {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Payment could not be completed';

  const msg = raw.toLowerCase();

  if (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('time out')
  ) {
    return { outcome: 'timed_out', message: raw };
  }

  if (
    msg.includes('declin') ||
    msg.includes('card_declined') ||
    msg.includes('insufficient') ||
    msg.includes('not authorized') ||
    msg.includes('do not honor') ||
    msg.includes('lost_card') ||
    msg.includes('stolen_card')
  ) {
    return { outcome: 'declined', message: raw };
  }

  if (msg.includes('canceled') || msg.includes('cancelled')) {
    return { outcome: 'timed_out', message: 'Payment was canceled or did not complete in time.' };
  }

  if (msg.includes('no such payment_intent')) {
    return {
      outcome: 'declined',
      message:
        'Payment could not be loaded for this raffle\'s Stripe account. Disconnect Tap to Pay on iPhone (or leave and re-open this screen), wait until it shows Ready, then try again.',
    };
  }

  return { outcome: 'declined', message: raw };
}

export function outcomeTitle(outcome: TerminalPaymentOutcome): string {
  switch (outcome) {
    case 'approved':
      return 'Payment approved';
    case 'declined':
      return 'Payment declined';
    case 'timed_out':
      return 'Payment timed out';
  }
}

export function buildPaymentReceiptText(params: {
  outcome: TerminalPaymentOutcome;
  amountFormatted: string;
  ticketQuantity: number;
  buyerName: string;
  buyerEmail: string;
  ticketId?: string;
  paymentIntentId?: string;
}): string {
  const lines = [
    'Chaffle — Tap to Pay on iPhone',
    `Status: ${outcomeTitle(params.outcome)}`,
    `Amount: ${params.amountFormatted}`,
    `Tickets: ${params.ticketQuantity}`,
    `Customer: ${params.buyerName}`,
    `Email: ${params.buyerEmail}`,
  ];
  if (params.ticketId) lines.push(`Reference: ${params.ticketId}`);
  if (params.paymentIntentId) lines.push(`Payment ID: ${params.paymentIntentId}`);
  lines.push('', 'This receipt contains payment details. Keep it confidential.');
  return lines.join('\n');
}
