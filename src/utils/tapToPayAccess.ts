import { Alert } from 'react-native';

const ADMIN_ONLY_MESSAGE =
  'Only an administrator can enable Tap to Pay on iPhone. Please contact your organization admin to set this up.';

/** Whether this signed-in user may accept Tap to Pay Terms on behalf of the merchant (3.8). */
export function canAcceptTapToPayTerms(isAdmin: boolean, canManageTapToPay: boolean): boolean {
  return isAdmin && canManageTapToPay;
}

export function showTapToPayAdminRequiredAlert(): void {
  Alert.alert('Administrator required', ADMIN_ONLY_MESSAGE);
}
