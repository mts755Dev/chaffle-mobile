import type { OrgApprovalStatus } from '../types';

export function formatOrganizationLabel(
  name: string | null | undefined,
  approvalStatus: OrgApprovalStatus | null | undefined,
): string {
  if (!name) return 'No organization';
  if (approvalStatus === 'terminated') return `${name} (Terminated)`;
  return name;
}
