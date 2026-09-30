import { supabase } from './supabase/client';

/**
 * Live ticket changes → callback (debounced).
 * Requires `ticket` in the supabase_realtime publication (see migration 012).
 */
export function subscribePaidTicketChanges(
  onChange: () => void,
  options?: { raffleId?: string },
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 250);
  };

  const channelName = `ticket-totals-${options?.raffleId ?? 'all'}-${Date.now()}`;
  let channel = supabase.channel(channelName).on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'ticket',
      ...(options?.raffleId
        ? { filter: `donation_formId=eq.${options.raffleId}` }
        : {}),
    },
    fire,
  );

  channel.subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
