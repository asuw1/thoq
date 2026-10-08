-- The parts of Supabase the migrations rely on, for testing on a plain Postgres + PostGIS.
-- Never run this against the real project: Supabase already has all of it.

do $$ begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), phone text, email text);

-- Supabase reads the signed-in user from the request's JWT; tests set it with set_config().
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants table access broadly and relies on row-level security; do the same.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
