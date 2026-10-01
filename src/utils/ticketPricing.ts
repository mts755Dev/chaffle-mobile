/**
 * Canonical ticket amount ↔ quantity rules (web paymentDialog / mobile TICKET_TIERS).
 * Server must reject any other pair so underpaid mass entries are impossible.
 */

export const TICKET_PRICE_PRESETS: ReadonlyArray<{ price: number; quantity: number }> = [
  { price: 5, quantity: 1 },
  { price: 10, quantity: 3 },
  { price: 20, quantity: 10 },
  { price: 40, quantity: 40 },
  { price: 100, quantity: 200 },
  { price: 250, quantity: 500 },
];

const PRESET_BY_PRICE = new Map(
  TICKET_PRICE_PRESETS.map((t) => [t.price, t.quantity] as const)
);

/** Custom amounts must be integer dollars strictly greater than $250 → qty = amount × 3. */
export const CUSTOM_TICKET_AMOUNT_MIN = 250;
export const CUSTOM_TICKETS_PER_DOLLAR = 3;

/** Expected entry quantity for a paid donation amount, or null if amount is invalid. */
export function expectedQuantityForAmount(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const preset = PRESET_BY_PRICE.get(amount);
  if (preset != null) return preset;
  if (Number.isInteger(amount) && amount > CUSTOM_TICKET_AMOUNT_MIN) {
    return amount * CUSTOM_TICKETS_PER_DOLLAR;
  }
  return null;
}

export function isValidPaidTicketPricing(
  amount: number,
  quantity: number
): boolean {
  const expected = expectedQuantityForAmount(amount);
  return expected != null && quantity === expected;
}

/** Free tickets: amount 0, exactly 1 entry. */
export function isValidFreeTicketPricing(
  amount: number,
  quantity: number
): boolean {
  return amount === 0 && quantity === 1;
}

export function assertValidTicketPricing(opts: {
  amount: number;
  quantity: number;
  isFree?: boolean;
}): void {
  const amount = Number(opts.amount);
  const quantity = Number(opts.quantity);
  if (opts.isFree) {
    if (!isValidFreeTicketPricing(amount, quantity)) {
      throw new Error('Free tickets must be $0 for exactly 1 entry');
    }
    return;
  }
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Invalid ticket quantity');
  }
  if (!isValidPaidTicketPricing(amount, quantity)) {
    throw new Error('Invalid ticket amount/quantity combination');
  }
}

/** If amount is a known paid tier, return the canonical quantity (for paid-mark repair). */
export function coerceQuantityForPaidAmount(
  amount: number,
  quantity: number
): number {
  const expected = expectedQuantityForAmount(amount);
  return expected ?? quantity;
}
