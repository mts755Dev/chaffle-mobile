import type { AdminRole, OrgApprovalStatus } from '../types';

/** Org admins need super-admin approval before creating raffles. Super admins are unrestricted. */
export function canOrgCreateRaffles(
  role: AdminRole | null,
  approvalStatus: OrgApprovalStatus | null,
): boolean {
  if (role === 'super_admin') return true;
  if (role === 'org_admin') return approvalStatus === 'approved';
  return false;
}

/** Org Stripe Connect only after platform approval. */
export function canOrgConnectStripe(
  role: AdminRole | null,
  approvalStatus: OrgApprovalStatus | null,
): boolean {
  if (role === 'super_admin') return true;
  if (role === 'org_admin') return approvalStatus === 'approved';
  return false;
}

export function getOrgApprovalBannerMessage(
  approvalStatus: OrgApprovalStatus | null,
): string | null {
  switch (approvalStatus) {
    case 'pending':
      return 'Your organization is pending approval. Stripe Connect and raffle creation stay disabled until a super admin approves your account.';
    case 'rejected':
      return 'Your organization was not approved. Contact Chaffle support if you believe this is an error.';
    case 'terminated':
      return 'Your organization has been terminated. Contact Chaffle support if you need assistance.';
    default:
      return null;
  }
}
