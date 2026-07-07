export type PaymentChannel = "online" | "terminal";

const RATES: Record<PaymentChannel, { percent: number; fixedCents: number }> = {
  online: { percent: 0.029, fixedCents: 30 },
  terminal: { percent: 0.027, fixedCents: 5 },
};

export interface ChargeBreakdown {
  baseAmountCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  totalCents: number;
}

/** Gross-up charge so organizer nets baseAmount and platform receives optional 10% fee. */
export function computeChargeBreakdown(
  baseAmountCents: number,
  options: {
    includePlatformFee?: boolean;
    channel?: PaymentChannel;
  } = {},
): ChargeBreakdown {
  const channel = options.channel ?? "online";
  const { percent, fixedCents } = RATES[channel];
  const platformFeeCents = options.includePlatformFee
    ? Math.round(baseAmountCents * 0.1)
    : 0;
  const subtotalCents = baseAmountCents + platformFeeCents;
  const totalCents = Math.ceil((subtotalCents + fixedCents) / (1 - percent));
  const processingFeeCents = totalCents - subtotalCents;

  return {
    baseAmountCents,
    platformFeeCents,
    processingFeeCents,
    totalCents,
  };
}
