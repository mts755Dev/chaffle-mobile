import { supabase } from '../supabase/client';
import type { DonationForm } from '../../types';

async function invokeManageRaffleOrganization<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-raffle-organization', {
    body,
  });

  if (error) {
    let message = error.message || 'Raffle organization request failed';
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

export const raffleOrganizationApi = {
  assignToOrganization: async (
    raffleId: string,
    organizationId: string,
  ): Promise<{ raffle: DonationForm; stripeAccountId: string }> => {
    const result = await invokeManageRaffleOrganization<{
      raffle: DonationForm;
      stripeAccountId: string;
    }>({
      action: 'assign',
      raffleId,
      organizationId,
    });
    return result;
  },

  unassignFromOrganization: async (
    raffleId: string,
  ): Promise<{ raffle: DonationForm }> => {
    const result = await invokeManageRaffleOrganization<{ raffle: DonationForm }>({
      action: 'unassign',
      raffleId,
    });
    return result;
  },
};
