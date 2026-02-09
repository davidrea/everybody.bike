alter table profiles
  add column calendar_token uuid not null default gen_random_uuid();

alter table profiles
  add constraint profiles_calendar_token_unique unique (calendar_token);
