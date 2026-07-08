import { Alert } from 'react-native';
import type { AdminRole, StripeAccount } from '../types';

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

/**
 * Charges use the organization Stripe account only when this user belongs to an organization.
 * Super-admin workers assigned to a standalone (no-org) raffle use that raffle's Stripe instead.
 */
export function usesOrganizationStripe(
  role: AdminRole | null,
  organizationId?: string | null,
): boolean {
  if (role === 'org_admin') return true;
  if (role === 'worker') return !!organizationId;
  return false;
}

/** Prefer the raffle's current org link over JWT metadata (e.g. after super-admin assignment). */
export function resolveTapToPayOrganizationId(
  raffleOrganizationId?: string | null,
  authOrganizationId?: string | null,
): string | null {
  if (raffleOrganizationId !== undefined) {
    return raffleOrganizationId;
  }
  return authOrganizationId ?? null;
}

export function isRaffleStripeChargeable(
  stripeAccount?: StripeAccount | null,
): boolean {
  if (!stripeAccount?.id) return false;
  return stripeAccount.charges_enabled !== false;
}

export function isOrgTapToPayReady(
  role: AdminRole | null,
  orgStripeConnected: boolean,
  orgStripeAccountId: string | null,
  organizationId?: string | null,
): boolean {
  if (!usesOrganizationStripe(role, organizationId)) return true;
  return orgStripeConnected && !!orgStripeAccountId;
}

/**
 * True when Tap to Pay can charge using org Stripe or the raffle's own connected account.
 * Workers on raffles that were linked to an org after creation still use the raffle Stripe
 * copied onto the org/raffle record even if auth org state is stale.
 */
export function isTapToPayPaymentReady(
  role: AdminRole | null,
  orgStripeConnected: boolean,
  orgStripeAccountId: string | null,
  organizationId: string | null | undefined,
  raffleStripeAccount?: StripeAccount | null,
): boolean {
  if (isRaffleStripeChargeable(raffleStripeAccount)) return true;
  return isOrgTapToPayReady(
    role,
    orgStripeConnected,
    orgStripeAccountId,
    organizationId,
  );
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
  organizationId?: string | null,
  raffleStripeAccount?: StripeAccount | null,
): boolean {
  if (!isAdmin) return false;
  return isTapToPayPaymentReady(
    role,
    orgStripeConnected,
    orgStripeAccountId,
    organizationId,
    raffleStripeAccount,
  );
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

export function showRaffleStripeRequiredAlert(onOk?: () => void): void {
  Alert.alert(
    'Stripe required',
    'This raffle does not have Stripe connected. Link Stripe on the raffle before using Tap to Pay on iPhone.',
    [{ text: 'OK', onPress: onOk }],
  );
}
