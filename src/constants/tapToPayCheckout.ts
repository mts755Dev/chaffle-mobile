/** Apple Tap to Pay on iPhone — checkout copy (US, Section 5 required). */

export function tapToPayCheckoutButtonLabel(amountFormatted: string): string {
  return `Tap to Pay on iPhone · ${amountFormatted}`;
}

export const TAP_TO_PAY_INITIALIZING_TITLE = 'Initializing Tap to Pay…';
export const TAP_TO_PAY_INITIALIZING_SUBTITLE =
  'Tap to Pay on iPhone will be available shortly.';

export const TAP_TO_PAY_PROCESSING_TITLE = 'Processing payment…';
export const TAP_TO_PAY_PROCESSING_SUBTITLE =
  'Your transaction is underway. Please wait.';
