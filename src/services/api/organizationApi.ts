import { invokeEdgeFunction } from '../supabase/invokeFunction';
import type { OrgApprovalStatus, OrganizationRecord } from '../../types';

export type OrganizationListFilter = OrgApprovalStatus | 'all';

async function invokeManageOrganizations<T>(
  body: Record<string, unknown>,
): Promise<T> {
  return invokeEdgeFunction<T>(
    'manage-organizations',
    body,
    'Organization request failed',
  );
}

export const organizationApi = {
  getOrganizationsByIds: async (
    organizationIds: string[],
  ): Promise<OrganizationRecord[]> => {
    if (organizationIds.length === 0) return [];

    const result = await invokeManageOrganizations<{ organizations: OrganizationRecord[] }>({
      action: 'list-by-ids',
      organizationIds,
    });
    return result.organizations ?? [];
  },

  listOrganizations: async (
    filter: OrganizationListFilter = 'all',
  ): Promise<OrganizationRecord[]> => {
    const result = await invokeManageOrganizations<{ organizations: OrganizationRecord[] }>({
      action: 'list',
      filter,
    });
    return result.organizations ?? [];
  },

  countPendingOrganizations: async (): Promise<number> => {
    const result = await invokeManageOrganizations<{ count: number }>({
      action: 'count-pending',
    });
    return result.count ?? 0;
  },

  updateApprovalStatus: async (
    organizationId: string,
    status: Extract<OrgApprovalStatus, 'approved' | 'rejected'>,
    approvedByUserId: string,
  ): Promise<OrganizationRecord> => {
    const result = await invokeManageOrganizations<{ organization: OrganizationRecord }>({
      action: 'update-status',
      organizationId,
      status,
      approvedByUserId,
    });
    return result.organization;
  },

  terminateOrganization: async (organizationId: string): Promise<void> => {
    await invokeManageOrganizations<{ success: boolean }>({
      action: 'terminate',
      organizationId,
    });
  },
};
