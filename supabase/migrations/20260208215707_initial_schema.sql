-- everybody.bike — Initial Schema Migration
-- Creates all baseline tables, indexes, RLS policies, and triggers.

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ============================================================
-- TABLES
-- ============================================================

-- Groups (rider groups like "Shredders", "Trail Blazers")
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#6B7280',
  description text,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- Profiles (adult users — linked to auth.users)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null,
  roles text[] not null default '{}',
  rider_group_id uuid references public.groups(id) on delete set null,
  avatar_url text,
  invite_status text not null default 'pending' check (invite_status in ('pending', 'accepted')),
  invited_at timestamptz,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Riders (minor dependents — not authenticated users)
create table public.riders (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  group_id uuid references public.groups(id) on delete set null,
  date_of_birth date,
  emergency_contact text,
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rider-Parent join table (many-to-many: riders ↔ parent profiles)
create table public.rider_parents (
  rider_id uuid not null references public.riders(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null default 'parent' check (relationship in ('parent', 'guardian', 'emergency_contact')),
  is_primary boolean not null default false,
  primary key (rider_id, parent_id)
);

-- Roll Model ↔ Group assignment (which groups a Roll Model coaches)
create table public.roll_model_groups (
  roll_model_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (roll_model_id, group_id)
);

-- Events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('ride', 'clinic', 'social', 'meeting', 'other')),
  description text,
  location text,
  map_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  rsvp_deadline timestamptz,
  capacity int,
  weather_notes text,
  recurrence_rule text,
  series_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Event ↔ Group join table
create table public.event_groups (
  event_id uuid not null references public.events(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (event_id, group_id)
);

-- RSVPs
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.riders(id) on delete cascade,
  status text not null check (status in ('yes', 'no', 'maybe')),
  responded_at timestamptz not null default now()
);

-- Push subscriptions (Web Push API endpoints)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys_p256dh text not null,
  keys_auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Notification preferences (per-user opt-in/out)
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  new_event boolean not null default true,
  rsvp_reminder boolean not null default true,
  event_update boolean not null default true,
  custom_message boolean not null default true
);

-- Scheduled notifications (queued for future delivery)
create table public.scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text,
  scheduled_for timestamptz not null,
  target_type text not null check (target_type in ('all', 'group', 'event_rsvpd', 'event_not_rsvpd')),
  target_id uuid,
  sent boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Passkey credentials (WebAuthn)
create table public.passkey_credentials (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  device_type text,
  backed_up boolean not null default false,
  transports text[],
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- RSVP: self-RSVPs are unique per (event, user) when rider_id is NULL
create unique index rsvps_self_unique on public.rsvps (event_id, user_id) where rider_id is null;

-- RSVP: minor RSVPs are unique per (event, rider) when rider_id is NOT NULL
create unique index rsvps_minor_unique on public.rsvps (event_id, rider_id) where rider_id is not null;

-- Fast event lookups by date
create index events_starts_at_idx on public.events (starts_at);

-- Fast profile lookup by email
create index profiles_email_idx on public.profiles (email);

-- Fast rider lookup by group
create index riders_group_id_idx on public.riders (group_id);

-- Fast lookup of events by series
create index events_series_id_idx on public.events (series_id) where series_id is not null;

-- Scheduled notifications: find unsent notifications due for delivery
create index scheduled_notifications_pending_idx on public.scheduled_notifications (scheduled_for) where sent = false;

-- Passkey credentials: lookup by user
create index passkey_credentials_user_id_idx on public.passkey_credentials (user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if the current user has a given role
create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and required_role = any(roles)
  );
$$;

-- Check if the current user is an admin or super_admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and (roles && array['admin', 'super_admin'])
  );
$$;

-- Check if the current user is a super_admin
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and 'super_admin' = any(roles)
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.riders enable row level security;
alter table public.rider_parents enable row level security;
alter table public.groups enable row level security;
alter table public.roll_model_groups enable row level security;
alter table public.events enable row level security;
alter table public.event_groups enable row level security;
alter table public.rsvps enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.scheduled_notifications enable row level security;
alter table public.passkey_credentials enable row level security;

-- ---- PROFILES ----

-- All authenticated users can read all profiles
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

-- Users can update their own name and avatar
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins can insert profiles (for invites)
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

-- ---- RIDERS ----

-- Parents can read their own linked riders
create policy "riders_select_parent" on public.riders
  for select to authenticated
  using (
    exists (
      select 1 from public.rider_parents
      where rider_parents.rider_id = riders.id
      and rider_parents.parent_id = auth.uid()
    )
  );

-- Roll Models can read riders in their assigned groups
create policy "riders_select_roll_model" on public.riders
  for select to authenticated
  using (
    exists (
      select 1 from public.roll_model_groups
      where roll_model_groups.roll_model_id = auth.uid()
      and roll_model_groups.group_id = riders.group_id
    )
  );

-- Admins can read all riders
create policy "riders_select_admin" on public.riders
  for select to authenticated
  using (public.is_admin());

-- Parents can insert riders (will need to also create rider_parents link)
create policy "riders_insert_parent" on public.riders
  for insert to authenticated
  with check (public.has_role('parent'));

-- Admins can insert riders
create policy "riders_insert_admin" on public.riders
  for insert to authenticated
  with check (public.is_admin());

-- Parents can update their linked riders
create policy "riders_update_parent" on public.riders
  for update to authenticated
  using (
    exists (
      select 1 from public.rider_parents
      where rider_parents.rider_id = riders.id
      and rider_parents.parent_id = auth.uid()
    )
  );

-- Admins can update all riders
create policy "riders_update_admin" on public.riders
  for update to authenticated
  using (public.is_admin());

-- Admins can delete riders
create policy "riders_delete_admin" on public.riders
  for delete to authenticated
  using (public.is_admin());

-- ---- RIDER_PARENTS ----

-- Parents can read their own links
create policy "rider_parents_select_own" on public.rider_parents
  for select to authenticated
  using (parent_id = auth.uid());

-- Admins can read all rider-parent links
create policy "rider_parents_select_admin" on public.rider_parents
  for select to authenticated
  using (public.is_admin());

-- Parents can insert links to riders they just created
create policy "rider_parents_insert_parent" on public.rider_parents
  for insert to authenticated
  with check (parent_id = auth.uid());

-- Admins can insert rider-parent links
create policy "rider_parents_insert_admin" on public.rider_parents
  for insert to authenticated
  with check (public.is_admin());

-- Admins can delete rider-parent links
create policy "rider_parents_delete_admin" on public.rider_parents
  for delete to authenticated
  using (public.is_admin());

-- ---- GROUPS ----

-- All authenticated users can read groups
create policy "groups_select" on public.groups
  for select to authenticated
  using (true);

-- Admins can CRUD groups
create policy "groups_insert_admin" on public.groups
  for insert to authenticated
  with check (public.is_admin());

create policy "groups_update_admin" on public.groups
  for update to authenticated
  using (public.is_admin());

create policy "groups_delete_admin" on public.groups
  for delete to authenticated
  using (public.is_admin());

-- ---- ROLL_MODEL_GROUPS ----

-- All authenticated users can read roll model group assignments
create policy "roll_model_groups_select" on public.roll_model_groups
  for select to authenticated
  using (true);

-- Admins can manage roll model group assignments
create policy "roll_model_groups_insert_admin" on public.roll_model_groups
  for insert to authenticated
  with check (public.is_admin());

create policy "roll_model_groups_delete_admin" on public.roll_model_groups
  for delete to authenticated
  using (public.is_admin());

-- ---- EVENTS ----

-- All authenticated users can read events (further scoping can be app-level)
create policy "events_select" on public.events
  for select to authenticated
  using (true);

-- Admins can CRUD events
create policy "events_insert_admin" on public.events
  for insert to authenticated
  with check (public.is_admin());

create policy "events_update_admin" on public.events
  for update to authenticated
  using (public.is_admin());

create policy "events_delete_admin" on public.events
  for delete to authenticated
  using (public.is_admin());

-- ---- EVENT_GROUPS ----

-- All authenticated users can read event-group assignments
create policy "event_groups_select" on public.event_groups
  for select to authenticated
  using (true);

-- Admins can manage event-group assignments
create policy "event_groups_insert_admin" on public.event_groups
  for insert to authenticated
  with check (public.is_admin());

create policy "event_groups_delete_admin" on public.event_groups
  for delete to authenticated
  using (public.is_admin());

-- ---- RSVPS ----

-- All authenticated users can read RSVPs for events they can see
create policy "rsvps_select" on public.rsvps
  for select to authenticated
  using (true);

-- Users can insert their own RSVPs (self or for their minor riders)
create policy "rsvps_insert_own" on public.rsvps
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      -- Self RSVP: rider_id must be null
      rider_id is null
      -- Or parent RSVP: must be linked to the rider
      or exists (
        select 1 from public.rider_parents
        where rider_parents.rider_id = rsvps.rider_id
        and rider_parents.parent_id = auth.uid()
      )
    )
  );

-- Users can update their own RSVPs
create policy "rsvps_update_own" on public.rsvps
  for update to authenticated
  using (
    user_id = auth.uid()
    or (
      rider_id is not null
      and exists (
        select 1 from public.rider_parents
        where rider_parents.rider_id = rsvps.rider_id
        and rider_parents.parent_id = auth.uid()
      )
    )
  );

-- Admins can read all RSVPs
create policy "rsvps_select_admin" on public.rsvps
  for select to authenticated
  using (public.is_admin());

-- ---- PUSH_SUBSCRIPTIONS ----

-- Users can only manage their own push subscriptions
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- NOTIFICATION_PREFERENCES ----

-- Users can only manage their own preferences
create policy "notification_preferences_select_own" on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "notification_preferences_update_own" on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid());

-- ---- SCHEDULED_NOTIFICATIONS ----

-- Admins only
create policy "scheduled_notifications_select_admin" on public.scheduled_notifications
  for select to authenticated
  using (public.is_admin());

create policy "scheduled_notifications_insert_admin" on public.scheduled_notifications
  for insert to authenticated
  with check (public.is_admin());

create policy "scheduled_notifications_update_admin" on public.scheduled_notifications
  for update to authenticated
  using (public.is_admin());

create policy "scheduled_notifications_delete_admin" on public.scheduled_notifications
  for delete to authenticated
  using (public.is_admin());

-- ---- PASSKEY_CREDENTIALS ----

-- Users can only manage their own passkeys
create policy "passkey_credentials_select_own" on public.passkey_credentials
  for select to authenticated
  using (user_id = auth.uid());

create policy "passkey_credentials_insert_own" on public.passkey_credentials
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "passkey_credentials_update_own" on public.passkey_credentials
  for update to authenticated
  using (user_id = auth.uid());

create policy "passkey_credentials_delete_own" on public.passkey_credentials
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- TRIGGER: Auto-create profile on new auth.users signup
-- ============================================================

-- When a user signs up via magic link, if a profile already exists (from admin invite),
-- update its invite_status to 'accepted'. Otherwise create a new profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, roles, invite_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(
      (select array_agg(r) from jsonb_array_elements_text(new.raw_user_meta_data->'roles') as r),
      '{}'
    ),
    'accepted'
  )
  on conflict (id) do update
  set invite_status = 'accepted',
      updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger riders_updated_at
  before update on public.riders
  for each row execute function public.update_updated_at();

create trigger events_updated_at
  before update on public.events
  for each row execute function public.update_updated_at();
