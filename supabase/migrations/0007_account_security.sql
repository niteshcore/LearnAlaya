-- =====================================================================
-- LearnAlaya — 0007: own password before anything else
-- Adds on top of 0001–0006 (never edit earlier files). Run once in the SQL editor.
--
-- Accounts are created (and passwords reset) by an admin, who sees the
-- temporary password. Until the person sets their own password:
--   * the database refuses every read and write except their own profile row
--     and their own account_security row (so the app can show "set your password"),
--   * notes files can't be downloaded or uploaded.
-- Only the Edge Functions (service role) write account_security:
--   admin-create-user / admin-reset-password set must_change_password = true,
--   change-password checks the current password, sets the new one and clears it.
--
-- Existing non-admin accounts are marked too: their passwords were all
-- temporary ones the admin has seen. Admins (created by hand, protected by
-- two-step codes) are left alone.
-- =====================================================================

create table account_security (
  user_id uuid primary key references profiles(id) on delete cascade,
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table account_security enable row level security;

-- Read only: there are no insert/update/delete policies, so app users can't clear the flag themselves.
create policy read_own_account_security on account_security for select to authenticated
  using (user_id = (select auth.uid()) or is_admin());

create or replace function password_change_pending() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select must_change_password from account_security where user_id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- RESTRICTIVE, so it is ANDed with every existing policy (like 0005's active_users_only).
-- A table added in a later migration needs the same policy.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables
           where schemaname = 'public' and rowsecurity and tablename not in ('profiles', 'account_security') loop
    execute format('create policy own_password_set on %I as restrictive for all to authenticated
                      using (not (select password_change_pending())) with check (not (select password_change_pending()))', t);
  end loop;
end $$;
create policy own_password_set on profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or not (select password_change_pending()))
  with check (not (select password_change_pending()));

-- Notes files: also deactivated users (the read policy relied on notes RLS alone).
create policy learnalaya_notes_account_ok on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'notes' or ((select public.my_role()) is not null and not (select public.password_change_pending())))
  with check (bucket_id <> 'notes' or ((select public.my_role()) is not null and not (select public.password_change_pending())));

insert into account_security (user_id, must_change_password)
select id, true from profiles where role <> 'admin'
on conflict (user_id) do nothing;
