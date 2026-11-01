-- =====================================================================
-- LearnAlaya — 0003: timetable upkeep, rescheduling, holidays
-- Adds on top of 0001 (never edit 0001). Safe to run once in the SQL editor.
--
-- * Editing the weekly timetable (timetable_slots) keeps the concrete classes
--   (class_sessions) for the next 14 days in step automatically.
-- * Adding / removing a holiday cancels / restores that day's classes.
-- * Teachers reschedule a class with reschedule_session(): the original stays as
--   'rescheduled' (so the timetable never re-creates it) and a new one-off class is added.
-- * Students and parents get a 'class_update' notification when a class is
--   cancelled, moved or brought back.
-- * The nightly job functions from 0001 are no longer callable by anyone with the
--   public anon key; signed-in users get a bounded ensure_upcoming_sessions() instead.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lock down job functions (they are security definer and take any range)
-- ---------------------------------------------------------------------
revoke execute on function generate_sessions(date, date) from public, anon, authenticated;
revoke execute on function queue_fee_reminders() from public, anon, authenticated;

-- Tops up the next 14 days of classes from the timetable. Idempotent and bounded,
-- so the app can call it whenever someone opens a timetable.
create or replace function ensure_upcoming_sessions() returns int
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then return 0; end if;
  return generate_sessions(institute_today(), institute_today() + 14);
end $$;
revoke execute on function ensure_upcoming_sessions() from public, anon;
grant execute on function ensure_upcoming_sessions() to authenticated;

-- ---------------------------------------------------------------------
-- Timetable edits -> upcoming classes
-- Classes that already happened, have attendance, or were changed by hand
-- (cancelled / moved / completed) are never touched.
-- ---------------------------------------------------------------------
create or replace function drop_untouched_sessions(p_slot uuid) returns void
language sql security definer set search_path = public as $$
  delete from class_sessions s
  where s.slot_id = p_slot
    and s.session_date >= institute_today()
    and s.status = 'scheduled'
    and not exists (select 1 from attendance a where a.session_id = s.id);
$$;
revoke execute on function drop_untouched_sessions(uuid) from public, anon, authenticated;

create or replace function sync_slot_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_today date := institute_today();
begin
  if tg_op = 'DELETE' then
    perform drop_untouched_sessions(old.id);
    return old;
  end if;
  if tg_op = 'UPDATE' then
    perform drop_untouched_sessions(old.id);
  end if;
  insert into class_sessions (class_subject_id, slot_id, session_date, start_time, end_time, room)
  select new.class_subject_id, new.id, d::date, new.start_time, new.end_time, new.room
  from generate_series(v_today, v_today + 14, interval '1 day') d
  where extract(isodow from d) = new.day_of_week
    and d::date >= new.effective_from
    and (new.effective_to is null or d::date <= new.effective_to)
    and not exists (select 1 from holidays h where h.date = d::date)
  on conflict (slot_id, session_date) do nothing;
  return new;
end $$;

-- BEFORE DELETE: the slot_id foreign key nulls class_sessions.slot_id once the row is gone.
create trigger trg_slot_sessions_delete before delete on timetable_slots
for each row execute function sync_slot_sessions();
create trigger trg_slot_sessions_upsert after insert or update on timetable_slots
for each row execute function sync_slot_sessions();

-- ---------------------------------------------------------------------
-- Holidays -> cancel / restore that day's classes
-- ---------------------------------------------------------------------
create or replace function sync_holiday_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update class_sessions s set status = 'cancelled', status_note = 'Holiday: ' || new.title
    where s.session_date = new.date and s.status = 'scheduled'
      and not exists (select 1 from attendance a where a.session_id = s.id);
    return new;
  end if;
  update class_sessions set status = 'scheduled', status_note = null
  where session_date = old.date and status = 'cancelled' and status_note = 'Holiday: ' || old.title;
  if old.date >= institute_today() then perform generate_sessions(old.date, old.date); end if;
  return old;
end $$;
create trigger trg_holiday_sessions after insert or delete on holidays
for each row execute function sync_holiday_sessions();

-- ---------------------------------------------------------------------
-- Reschedule: one call, all or nothing
-- ---------------------------------------------------------------------
create or replace function reschedule_session(
  p_session uuid, p_date date, p_start time, p_end time, p_room text default null, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s class_sessions;
  v_new uuid;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into s from class_sessions where id = p_session for update;
  if not found or not can_run_session(p_session) then
    raise exception 'You can only reschedule your own classes.' using errcode = '42501';
  end if;
  if s.status in ('cancelled', 'rescheduled') then
    raise exception 'This class was already cancelled or moved.';
  end if;
  if exists (select 1 from attendance where session_id = p_session) then
    raise exception 'Attendance is already marked for this class, so it can’t be moved.';
  end if;
  if p_end <= p_start then raise exception 'The class has to end after it starts.'; end if;
  if p_date < institute_today() then raise exception 'Pick today or a later date.'; end if;
  if p_date = s.session_date and p_start = s.start_time and p_end = s.end_time then
    raise exception 'That’s the same time as before.';
  end if;

  insert into class_sessions (class_subject_id, session_date, start_time, end_time, room, substitute_teacher_id, status_note)
  values (s.class_subject_id, p_date, p_start, p_end, coalesce(nullif(trim(p_room), ''), s.room), s.substitute_teacher_id,
          'Rescheduled from ' || to_char(s.session_date, 'Dy FMDD Mon') || ', ' || to_char(s.start_time, 'FMHH12:MI AM')
          || coalesce(' — ' || v_reason, ''))
  returning id into v_new;

  update class_sessions
  set status = 'rescheduled',
      status_note = 'Moved to ' || to_char(p_date, 'Dy FMDD Mon') || ', ' || to_char(p_start, 'FMHH12:MI AM')
                    || coalesce(' — ' || v_reason, '')
  where id = p_session;
  return v_new;
end $$;
revoke execute on function reschedule_session(uuid, date, time, time, text, text) from public, anon;
grant execute on function reschedule_session(uuid, date, time, time, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Tell students and parents when an upcoming class changes
-- (holiday cancellations are skipped: the holiday itself is the announcement)
-- ---------------------------------------------------------------------
create or replace function notify_session_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status
     or new.session_date < institute_today()
     or coalesce(new.status_note, '') like 'Holiday: %'
     or coalesce(old.status_note, '') like 'Holiday: %'
     or not (new.status in ('cancelled', 'rescheduled') or (old.status = 'cancelled' and new.status = 'scheduled')) then
    return new;
  end if;
  insert into notifications (recipient_id, type, payload, dedupe_key)
  select r.profile_id, 'class_update',
         jsonb_build_object('session_id', new.id, 'class_subject_id', new.class_subject_id, 'status', new.status,
                            'session_date', new.session_date, 'start_time', new.start_time, 'note', new.status_note),
         'class_update:' || new.id || ':' || new.status || ':' || extract(epoch from now())::bigint || ':' || r.profile_id
  from (
    select ss.student_id as profile_id from student_subjects ss where ss.class_subject_id = new.class_subject_id
    union
    select ps.parent_id from parent_students ps
    join student_subjects ss on ss.student_id = ps.student_id
    where ss.class_subject_id = new.class_subject_id
  ) r
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create trigger trg_notify_session_change after update on class_sessions
for each row execute function notify_session_change();

-- Fill the next two weeks for any timetable that already exists.
select generate_sessions(institute_today(), institute_today() + 14);
