-- Add event-aware scheduling metadata to scheduled notifications.

alter table public.scheduled_notifications
  add column if not exists category text not null default 'custom_message',
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.scheduled_notifications
  drop constraint if exists scheduled_notifications_target_type_check;

alter table public.scheduled_notifications
  add constraint scheduled_notifications_target_type_check
  check (target_type in ('all', 'group', 'event_all', 'event_rsvpd', 'event_not_rsvpd'));

alter table public.scheduled_notifications
  add constraint scheduled_notifications_category_check
  check (category in ('announcement', 'reminder', 'event_update', 'custom_message'));

create index if not exists scheduled_notifications_event_id_idx
  on public.scheduled_notifications (event_id);

-- Allow admins to view push subscription status.
create policy "push_subscriptions_select_admin" on public.push_subscriptions
  for select using (public.is_admin());
