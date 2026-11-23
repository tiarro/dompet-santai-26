-- Run after the migration, Edge Function deployment, and Vault secret setup.
-- Vault names: daily_reminders_project_url and daily_reminders_cron_secret.
-- No VAPID private key or Supabase service-role key is needed in this SQL.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'daily_reminders_project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'daily_reminders_cron_secret') then
    raise exception 'Configure daily_reminders Vault secrets first';
  end if;
end $$;

-- A fixed job name updates the existing schedule when rerun.
select cron.schedule('dompet-santai-daily-reminders', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminders_project_url') || '/functions/v1/daily-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminders_cron_secret')),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
