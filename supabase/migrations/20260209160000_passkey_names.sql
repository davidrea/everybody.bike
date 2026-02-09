-- Passkey display names and last-used tracking
alter table public.passkey_credentials
  add column if not exists name text,
  add column if not exists last_used_at timestamptz;
