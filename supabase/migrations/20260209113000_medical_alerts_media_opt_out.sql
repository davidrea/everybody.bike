-- Add medical alerts and media consent flags for adults and youth riders.
alter table public.profiles
  add column if not exists medical_alerts text,
  add column if not exists media_opt_out boolean not null default false;

alter table public.riders
  add column if not exists media_opt_out boolean not null default false;
