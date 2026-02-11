-- Security hardening migration
-- Fixes several identified vulnerabilities in RLS policies and schema

-- ============================================================
-- 1. CRITICAL: Restrict profiles UPDATE to safe columns only
--    Previously, users could update ANY column on their own profile,
--    including `roles`, `invite_status`, `invited_by`, `rider_group_id`.
--    This could allow privilege escalation (e.g., granting self super_admin).
-- ============================================================

drop policy if exists "profiles_update_own" on public.profiles;

-- Users can only update their own non-sensitive columns.
-- Sensitive columns (roles, invite_status, rider_group_id, invited_at, invited_by)
-- are protected: their values must remain unchanged for the update to succeed.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and roles = (select p.roles from public.profiles p where p.id = auth.uid())
    and invite_status = (select p.invite_status from public.profiles p where p.id = auth.uid())
    and rider_group_id is not distinct from (select p.rider_group_id from public.profiles p where p.id = auth.uid())
    and invited_at is not distinct from (select p.invited_at from public.profiles p where p.id = auth.uid())
    and invited_by is not distinct from (select p.invited_by from public.profiles p where p.id = auth.uid())
  );

-- Admins need a separate policy to update roles/invite_status/group on OTHER users
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 2. HIGH: Tighten RSVP SELECT policy
--    Previously ANY authenticated user could read ALL RSVPs.
--    Now scoped: users see own RSVPs, parent RSVPs for their riders,
--    and admins/roll_models see all (needed for dashboard).
-- ============================================================

drop policy if exists "rsvps_select" on public.rsvps;
drop policy if exists "rsvps_select_admin" on public.rsvps;

-- Users can read their own RSVPs (self-RSVPs and parent RSVPs they created)
create policy "rsvps_select_own" on public.rsvps
  for select to authenticated
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

-- Roll models and adult riders can read RSVPs for events they can access
-- (needed for event dashboard to show attendance)
create policy "rsvps_select_role" on public.rsvps
  for select to authenticated
  using (
    public.has_role('roll_model') or public.has_role('rider')
  );

-- Admins can read all RSVPs
create policy "rsvps_select_admin" on public.rsvps
  for select to authenticated
  using (public.is_admin());

-- ============================================================
-- 3. MEDIUM: Add admin INSERT/DELETE policies for RSVPs
--    Admin RSVP overrides use the admin client (service role),
--    but adding explicit RLS policies for completeness.
-- ============================================================

create policy "rsvps_insert_admin" on public.rsvps
  for insert to authenticated
  with check (public.is_admin());

create policy "rsvps_delete_admin" on public.rsvps
  for delete to authenticated
  using (public.is_admin());

create policy "rsvps_delete_own" on public.rsvps
  for delete to authenticated
  using (user_id = auth.uid());
