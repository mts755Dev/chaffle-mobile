import { Alert } from 'react-native';
import type { AdminRole } from '../types';

export function isWorkerRole(role: AdminRole | null): boolean {
  return role === 'worker';
}

/** Workers may only operate on the single raffle assigned at account creation. */
export function canWorkerAccessRaffle(
  role: AdminRole | null,
  workerRaffleId: string | null,
  targetRaffleId: string,
): boolean {
  if (!isWorkerRole(role)) return true;
  return !!workerRaffleId && workerRaffleId === targetRaffleId;
}

export function blockWorkerFromForeignRaffle(
  role: AdminRole | null,
  workerRaffleId: string | null,
  targetRaffleId: string,
  onBlocked: () => void,
): boolean {
  if (canWorkerAccessRaffle(role, workerRaffleId, targetRaffleId)) {
    return true;
  }
  Alert.alert(
    'Access restricted',
    'You can only sell tickets for your assigned raffle.',
    [{ text: 'OK', onPress: onBlocked }],
  );
  return false;
}
