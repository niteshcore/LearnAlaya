-- =====================================================================
-- LearnAlaya — 0002: admin powers need two-step verification
--
-- An admin who signed in with only a password has an 'aal1' session.
-- Every admin RLS policy (admin_all, founder checks, can_view_*) goes
-- through is_admin(), so requiring 'aal2' here means a stolen admin
-- password alone can't read or change anything as admin.
--
-- The admin's own profile row stays readable (read_profiles allows
-- id = auth.uid()), so the login page can still see the role and ask
-- for the one-time code.
-- =====================================================================

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() = 'admin', false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
