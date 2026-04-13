-- Remove the unused emergency_contact column from the riders table.
-- Emergency contacts are modeled via the rider_parents join table
-- (relationship = 'emergency_contact'), not as a free-text field on riders.
alter table public.riders drop column if exists emergency_contact;
