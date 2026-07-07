import { supabase } from '../supabase/client';
import type { OrgApprovalStatus, OrganizationRecord } from '../../types';

export type OrganizationListFilter = OrgApprovalStatus | 'all';

async function invokeManageOrganizations<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-organizations', {
    body,
  });

  if (error) {
    let message = error.message || 'Organization request failed';
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.json();
        message = payload?.error || payload?.message || message;
      } catch {
        // Keep generic message if response body cannot be parsed.
      }
    }
    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
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
