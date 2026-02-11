-- Enable RLS on the migration tracking table.
-- No policies are added: only the postgres superuser (used by the
-- migrate runner) and the service_role can access this table.
-- Authenticated users are fully blocked.

alter table if exists public._applied_migrations enable row level security;
