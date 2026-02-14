-- Event cancellation metadata and constraints.

alter table public.events
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_reason text,
  add column if not exists canceled_by uuid references public.profiles(id) on delete set null;

alter table public.events
  drop constraint if exists events_cancellation_state_check;

alter table public.events
  add constraint events_cancellation_state_check
  check (
    (
      canceled_at is null
      and canceled_reason is null
      and canceled_by is null
    )
    or (
      canceled_at is not null
      and canceled_reason is not null
      and length(trim(canceled_reason)) > 0
    )
  );
