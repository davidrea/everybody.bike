-- Clean up: drop the old public._applied_migrations table if it exists.
-- The migrate runner now uses _migrations.applied (private schema,
-- not exposed to PostgREST) so this table is no longer needed.

drop table if exists public._applied_migrations;
