-- =====================================================================
-- LearnAlaya — 0005: security tightening
-- Adds on top of 0001–0004 (never edit earlier files). Run once in the SQL editor.
--
-- * Deactivated accounts (and auth users with no profile at all) can no longer
--   read or write anything through the API, only their own profile row so the
--   login page can say "this account is deactivated".
-- * Teachers can only change a class's status, note and topic directly; date,
--   time, room, subject and substitute stay with the admin (or reschedule_session()).
-- * Attendance can only be marked for students enrolled in that class's subject,
--   and a mark can't be moved to another class or student.
-- * Users can only flip read_at on their own notifications.
-- * Parents and teachers must have a valid phone number.
-- * Length / amount limits on free-text and money fields.
--
-- New checks use NOT VALID: existing rows are left alone, every new or edited row is checked.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Active, real users only
-- A RESTRICTIVE policy is ANDed with every existing policy, so this closes
-- the gap where is_parent_of() / can_view_student() ignore is_active.
-- Triggers and security definer functions run as the table owner and are not affected.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity and tablename <> 'profiles' loop
    execute format('create policy active_users_only on %I as restrictive for all to authenticated
                      using ((select my_role()) is not null) with check ((select my_role()) is not null)', t);
  end loop;
end $$;
create policy active_users_only on profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or (select my_role()) is not null)
  with check ((select my_role()) is not null);

-- ---------------------------------------------------------------------
-- "Is this a direct write from the app by a non-admin?"
-- PostgREST runs requests as role 'authenticated'; inside a security definer
-- function or trigger current_user is the owner, so trusted code passes.
-- ---------------------------------------------------------------------
create or replace function is_app_user_write() returns boolean
language sql stable set search_path = public as $$
  select current_user = 'authenticated' and not is_admin()
$$;

-- ---------------------------------------------------------------------
-- Class sessions: teachers change status / note / topic only
-- ---------------------------------------------------------------------
create or replace function guard_session_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_app_user_write() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' or new.substitute_teacher_id is not null or new.topic_covered is not null then
      raise exception 'An extra class starts as scheduled. Mark it from Attendance afterwards.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.class_subject_id, new.slot_id, new.session_date, new.start_time, new.end_time, new.room, new.substitute_teacher_id)
     is distinct from
     (old.class_subject_id, old.slot_id, old.session_date, old.start_time, old.end_time, old.room, old.substitute_teacher_id) then
    raise exception 'Only the admin can change a class''s date, time, room or teacher. Use Reschedule to move it.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and (new.status = 'rescheduled' or old.status = 'rescheduled') then
    raise exception 'Use Reschedule to move a class. A moved class can''t be brought back.' using errcode = '42501';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' and coalesce(old.status_note, '') like 'Holiday: %' then
    raise exception 'This class is off for a holiday. Ask the admin to remove the holiday.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_session before insert or update on class_sessions
for each row execute function guard_session_write();

-- ---------------------------------------------------------------------
-- Attendance: only for students enrolled in that class's subject
-- ---------------------------------------------------------------------
create or replace function session_has_student(p_session uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_sessions s
    join student_subjects ss on ss.class_subject_id = s.class_subject_id and ss.student_id = p_student
    where s.id = p_session
  )
$$;
revoke execute on function session_has_student(uuid, uuid) from public, anon;
grant execute on function session_has_student(uuid, uuid) to authenticated;

create or replace function guard_attendance_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_app_user_write() then return new; end if;
  if tg_op = 'UPDATE' and (new.session_id, new.student_id) is distinct from (old.session_id, old.student_id) then
    raise exception 'An attendance mark can''t be moved to another class or student.' using errcode = '42501';
  end if;
  if not session_has_student(new.session_id, new.student_id) then
    raise exception 'That student isn''t enrolled in this class.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_attendance before insert or update on attendance
for each row execute function guard_attendance_write();

-- ---------------------------------------------------------------------
-- Notifications: recipients may only mark them read
-- ---------------------------------------------------------------------
create or replace function guard_notification_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_app_user_write() and (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only the read mark of a notification can be changed.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_notification before update on notifications
for each row execute function guard_notification_update();

-- ---------------------------------------------------------------------
-- Phone numbers: E.164, and required for parents and teachers
-- ---------------------------------------------------------------------
alter table profile_private add constraint phone_format check (phone ~ '^\+[0-9]{8,15}$') not valid;

create or replace function require_contact_phone() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.phone is null and exists (select 1 from profiles where id = new.profile_id and role in ('parent', 'teacher')) then
    raise exception 'A phone number is required for parents and teachers.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_require_contact_phone before insert or update on profile_private
for each row execute function require_contact_phone();

-- ---------------------------------------------------------------------
-- Size limits (the app already enforces these; this stops direct API abuse)
-- ---------------------------------------------------------------------
alter table profiles        add constraint full_name_length   check (length(trim(full_name)) between 1 and 80) not valid;
alter table classes         add constraint class_name_length  check (length(name) <= 80 and length(section) <= 20) not valid;
alter table subjects        add constraint subject_name_length check (length(name) <= 80) not valid;
alter table holidays        add constraint holiday_title_length check (length(title) <= 80) not valid;
alter table timetable_slots add constraint slot_room_length   check (length(room) <= 30) not valid;
alter table class_sessions  add constraint session_text_length
  check (length(room) <= 30 and length(status_note) <= 300 and length(topic_covered) <= 300) not valid;
alter table fee_dues        add constraint fee_title_length   check (length(trim(title)) between 1 and 120) not valid;
alter table fee_dues        add constraint fee_amount_limit   check (amount <= 10000000) not valid;
alter table fee_payments    add constraint payment_text_length check (length(mode) <= 30 and length(reference) <= 120) not valid;
alter table fee_payments    add constraint payment_amount_limit check (amount <= 10000000) not valid;
