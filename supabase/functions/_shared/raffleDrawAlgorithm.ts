/**
 * Weighted raffle draw — mirrors chaffle/lib/raffleDraw.ts exactly.
 * Uses node:crypto.randomInt (same CSPRNG as the web Next.js server).
 */
import { randomInt } from "node:crypto";

export type DrawCandidate = { id: string; quantity: number };

export type PickResult = {
  winnerTicketId: string;
  totalEntries: number;
  randomValue: number;
  rngMethod: "node.crypto.randomInt";
  snapshot: DrawCandidate[];
};

export function pickWeightedWinner(candidates: DrawCandidate[]): PickResult {
  const eligible = candidates.filter((c) => c.quantity > 0);
  const totalEntries = eligible.reduce((sum, c) => sum + c.quantity, 0);

  if (totalEntries <= 0) {
    throw new Error("No eligible entries in pool");
  }

  const randomValue = randomInt(0, totalEntries);

  let cursor = 0;
  for (const c of eligible) {
    cursor += c.quantity;
    if (randomValue < cursor) {
      return {
        winnerTicketId: c.id,
        totalEntries,
        randomValue,
        rngMethod: "node.crypto.randomInt",
        snapshot: eligible,
      };
    }
  }

  throw new Error("Unreachable: weighted draw fell off the end");
}

/**
 * Re-derive the winner from a previously-recorded draw — mirrors web verifyDraw.
 * Auditors use this to confirm a draw was performed correctly.
 */
export function verifyDraw(
  snapshot: DrawCandidate[],
  randomValue: number,
  expectedWinnerTicketId: string,
): boolean {
  const eligible = snapshot.filter((c) => c.quantity > 0);
  const totalEntries = eligible.reduce((sum, c) => sum + c.quantity, 0);

  if (totalEntries <= 0) return false;
  if (randomValue < 0 || randomValue >= totalEntries) return false;

  let cursor = 0;
  for (const c of eligible) {
    cursor += c.quantity;
    if (randomValue < cursor) {
      return c.id === expectedWinnerTicketId;
    }
  }
  return false;
}

export function isDrawDue(
  drawDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (!drawDate) return false;
  return new Date(drawDate).getTime() <= now.getTime();
}

export function getTicketReferenceId(ticketId: string): string {
  return ticketId.split("-")[0].toUpperCase();
}
