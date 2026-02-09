-- Allow self RSVPs (roll models) to carry an optional assigned group for the event.
alter table public.rsvps
  add column assigned_group_id uuid references public.groups(id) on delete set null;

-- Minor rider RSVPs should never have a coach assignment.
alter table public.rsvps
  add constraint rsvps_assigned_group_requires_self_rsvp
  check (rider_id is null or assigned_group_id is null);

create index rsvps_assigned_group_id_idx on public.rsvps (assigned_group_id);
