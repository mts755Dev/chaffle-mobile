import type { Worker } from '../types';

export function workerDuplicateEmailMessage(
  existingRaffleId: string,
  requestedRaffleId: string,
): string {
  if (existingRaffleId === requestedRaffleId) {
    return 'A worker with this email already exists for this raffle.';
  }
  return 'This email is already registered as a worker for another raffle. Each worker can only be assigned to one raffle.';
}

export function findWorkerWithEmail(
  workers: Pick<Worker, 'email' | 'raffle_id'>[],
  email: string,
): Pick<Worker, 'email' | 'raffle_id'> | undefined {
  const normalized = email.trim().toLowerCase();
  return workers.find((worker) => worker.email.trim().toLowerCase() === normalized);
}
