-- Enable realtime for ticket so admin/worker dashboards can live-update pot + counts.
-- Safe to re-run: skips if ticket is already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ticket'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket;
  END IF;
END $$;
