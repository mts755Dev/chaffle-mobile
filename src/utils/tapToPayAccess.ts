import { Alert } from 'react-native';
import type { AdminRole } from '../types';

const ADMIN_ONLY_MESSAGE =
  'Only an authorized user can enable Tap to Pay on iPhone on this device.';

/** Org admin, super admin, and workers may run Tap to Pay setup on their own iPhone. */
export function canSetupTapToPayOnDevice(
  isAdmin: boolean,
  role: AdminRole | null,
): boolean {
  if (!isAdmin || !role) return false;
  return role === 'super_admin' || role === 'org_admin' || role === 'worker';
}

/** Charges run on the organization connected account (shared across org raffles). */
export function usesOrganizationStripe(role: AdminRole | null): boolean {
  return role === 'org_admin' || role === 'worker';
}

export function isOrgTapToPayReady(
  role: AdminRole | null,
  orgStripeConnected: boolean,
  orgStripeAccountId: string | null,
): boolean {
  if (!usesOrganizationStripe(role)) return true;
  return orgStripeConnected && !!orgStripeAccountId;
}

/** @deprecated Prefer canSetupTapToPayOnDevice(isAdmin, role). */
export function canAcceptTapToPayTerms(
  isAdmin: boolean,
  canManageTapToPay: boolean,
  role?: AdminRole | null,
): boolean {
  if (role) return canSetupTapToPayOnDevice(isAdmin, role);
  return isAdmin && canManageTapToPay;
}

export function canUseInPersonPayment(
  isAdmin: boolean,
  role: AdminRole | null,
  orgStripeConnected: boolean,
  orgStripeAccountId: string | null,
): boolean {
  if (!isAdmin) return false;
  return isOrgTapToPayReady(role, orgStripeConnected, orgStripeAccountId);
}

export function showTapToPayAdminRequiredAlert(): void {
  Alert.alert('Not authorized', ADMIN_ONLY_MESSAGE);
}

export function showOrgStripeRequiredAlert(
  onOk?: () => void,
  role?: AdminRole | null,
): void {
  const message =
    role === 'org_admin'
      ? 'Connect your organization Stripe account on the dashboard before using Tap to Pay on iPhone.'
      : 'Your organization has not connected Stripe yet. Ask your organization admin to connect Stripe before using Tap to Pay on iPhone.';
  Alert.alert('Stripe required', message, [{ text: 'OK', onPress: onOk }]);
}
