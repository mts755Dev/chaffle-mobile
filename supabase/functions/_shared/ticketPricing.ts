// @ts-nocheck — Deno edge shared helper (mirrors chaffle/lib/ticketPricing.ts).

const PRESETS = new Map([
  [5, 1],
  [10, 3],
  [20, 10],
  [40, 40],
  [100, 200],
  [250, 500],
]);

const CUSTOM_MIN = 250;
const CUSTOM_PER_DOLLAR = 3;

export function expectedQuantityForAmount(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const preset = PRESETS.get(amount);
  if (preset != null) return preset;
  if (Number.isInteger(amount) && amount > CUSTOM_MIN) {
    return amount * CUSTOM_PER_DOLLAR;
  }
  return null;
}

export function isValidPaidTicketPricing(
  amount: number,
  quantity: number,
): boolean {
  const expected = expectedQuantityForAmount(amount);
  return expected != null && quantity === expected;
}

export function isValidFreeTicketPricing(
  amount: number,
  quantity: number,
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
      throw new Error("Free tickets must be $0 for exactly 1 entry");
    }
    return;
  }
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Invalid ticket quantity");
  }
  if (!isValidPaidTicketPricing(amount, quantity)) {
    throw new Error("Invalid ticket amount/quantity combination");
  }
}
