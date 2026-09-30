import { invokeEdgeFunction } from '../supabase/invokeFunction';

export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  note?: string;
};

export type CustomDomainStatus = {
  domain: string;
  isLive: boolean;
  status: 'live' | 'pending_dns' | 'pending_verification';
  statusLabel: string;
  statusDescription: string;
  records: DnsRecord[];
  configuredBy: string | null;
};

type SetResult = {
  success: true;
  custom_domain: string | null;
  domainStatus: CustomDomainStatus | null;
};

export const customDomainApi = {
  set: async (
    raffleId: string,
    domain: string | null,
  ): Promise<SetResult> => {
    return invokeEdgeFunction<SetResult>(
      'manage-custom-domain',
      { action: 'set', raffleId, domain },
      'Failed to update custom domain',
    );
  },

  status: async (domain: string): Promise<CustomDomainStatus> => {
    const data = await invokeEdgeFunction<{
      success: true;
      domainStatus: CustomDomainStatus;
    }>(
      'manage-custom-domain',
      { action: 'status', domain },
      'Failed to load domain status',
    );
    return data.domainStatus;
  },
};
