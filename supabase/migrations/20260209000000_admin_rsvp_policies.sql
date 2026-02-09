-- Allow admins to insert RSVPs on behalf of any user
create policy "rsvps_insert_admin" on public.rsvps
  for insert to authenticated
  with check (public.is_admin());

-- Allow admins to update any RSVP
create policy "rsvps_update_admin" on public.rsvps
  for update to authenticated
  using (public.is_admin());

-- Allow admins to delete any RSVP (clear/reset)
create policy "rsvps_delete_admin" on public.rsvps
  for delete to authenticated
  using (public.is_admin());

-- Allow users to delete their own RSVPs
create policy "rsvps_delete_own" on public.rsvps
  for delete to authenticated
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
