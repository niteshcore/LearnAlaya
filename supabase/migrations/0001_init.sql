-- =====================================================================
-- LearnAlaya — Supabase schema v1
-- Roles: admin (founders are admins with a share %), teacher, student, parent
-- Run in Supabase SQL editor or as a migration (supabase db push).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role          as enum ('admin', 'teacher', 'student', 'parent');
create type enrollment_status  as enum ('active', 'inactive', 'completed');
create type session_status     as enum ('scheduled', 'completed', 'cancelled', 'delayed', 'rescheduled');
create type attendance_status  as enum ('present', 'absent', 'late', 'leave');
create type request_status     as enum ('pending', 'approved', 'rejected');
create type fee_status         as enum ('pending', 'partial', 'paid', 'overdue', 'waived');
create type channel_scope      as enum ('class', 'subject', 'institute', 'custom');
create type channel_visibility as enum ('public', 'private');
create type member_status      as enum ('active', 'pending', 'removed');
create type notify_channel     as enum ('in_app', 'whatsapp', 'sms', 'email');
create type notify_status      as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------
-- SETTINGS (single row)
-- ---------------------------------------------------------------------
create table institute_settings (
  id                        boolean primary key default true check (id),
  name                      text not null default 'LearnAlaya',
  timezone                  text not null default 'Asia/Kolkata',
  low_attendance_pct        numeric(5,2) not null default 75,
  attendance_edit_days      int not null default 0,      -- 0 = same day only
  fee_reminder_days_before  int[] not null default '{3,1}',
  fee_reminder_days_after   int[] not null default '{1,7}'
);
insert into institute_settings default values;

-- ---------------------------------------------------------------------
-- PEOPLE
-- ---------------------------------------------------------------------
-- One row per auth user. Login uses an institute ID: the Edge Function
-- creates the auth user with email '<login_id>@learnalaya.app'.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  login_id    text unique not null,
  full_name   text not null,
  role        user_role not null,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Contact details kept apart so they are never exposed through chat/profile reads.
create table profile_private (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  phone           text,          -- E.164, used for WhatsApp later
  whatsapp_opt_in boolean not null default false,
  address         text,
  date_of_birth   date
);

create table founders (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  share_pct   numeric(5,2) not null check (share_pct > 0 and share_pct <= 100)
);

-- ---------------------------------------------------------------------
-- ACADEMICS
-- ---------------------------------------------------------------------
create table classes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,              -- 'Class 10'
  section        text not null default 'A',
  academic_year  text not null,              -- '2026-27'
  is_active      boolean not null default true,
  unique (name, section, academic_year)
);

create table subjects (
  id     uuid primary key default gen_random_uuid(),
  name   text unique not null,
  color  text                                -- timetable colour coding
);

-- A subject taught in a class, by a teacher. Everything academic hangs off this.
create table class_subjects (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  subject_id  uuid not null references subjects(id),
  teacher_id  uuid references profiles(id),
  unique (class_id, subject_id)
);

create table students (
  profile_id   uuid primary key references profiles(id) on delete cascade,
  class_id     uuid not null references classes(id),
  roll_no      text,
  enrolled_on  date not null default current_date,
  status       enrollment_status not null default 'active'
);

create table student_subjects (
  student_id        uuid references students(profile_id) on delete cascade,
  class_subject_id  uuid references class_subjects(id) on delete cascade,
  primary key (student_id, class_subject_id)
);

create table parent_students (
  parent_id   uuid references profiles(id) on delete cascade,
  student_id  uuid references students(profile_id) on delete cascade,
  relation    text,                          -- 'father', 'mother', 'guardian'
  primary key (parent_id, student_id)
);

-- ---------------------------------------------------------------------
-- TIMETABLE & SESSIONS
-- ---------------------------------------------------------------------
create table timetable_slots (
  id                uuid primary key default gen_random_uuid(),
  class_subject_id  uuid not null references class_subjects(id) on delete cascade,
  day_of_week       smallint not null check (day_of_week between 1 and 7), -- 1 = Mon
  start_time        time not null,
  end_time          time not null check (end_time > start_time),
  room              text,
  effective_from    date not null default current_date,
  effective_to      date
);

create table holidays (
  date   date primary key,
  title  text not null
);

-- One concrete class on a concrete date. Generated from the timetable,
-- or created ad-hoc (extra class). Teachers update status here.
create table class_sessions (
  id                     uuid primary key default gen_random_uuid(),
  class_subject_id       uuid not null references class_subjects(id) on delete cascade,
  slot_id                uuid references timetable_slots(id) on delete set null,
  session_date           date not null,
  start_time             time not null,
  end_time               time not null,
  room                   text,
  status                 session_status not null default 'scheduled',
  substitute_teacher_id  uuid references profiles(id),
  topic_covered          text,
  status_note            text,
  updated_by             uuid references profiles(id),
  updated_at             timestamptz not null default now(),
  unique (slot_id, session_date)
);
create index on class_sessions (session_date);
create index on class_sessions (class_subject_id, session_date);

-- ---------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------
create table attendance (
  session_id  uuid references class_sessions(id) on delete cascade,
  student_id  uuid references students(profile_id) on delete cascade,
  status      attendance_status not null,
  marked_by   uuid references profiles(id),
  marked_at   timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table attendance_log (
  id          bigint generated always as identity primary key,
  session_id  uuid not null,
  student_id  uuid not null,
  old_status  attendance_status,
  new_status  attendance_status,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SYLLABUS, HOMEWORK, NOTES, EXAMS
-- ---------------------------------------------------------------------
create table syllabus_topics (
  id                uuid primary key default gen_random_uuid(),
  class_subject_id  uuid not null references class_subjects(id) on delete cascade,
  title             text not null,
  sort_order        int not null default 0,
  completed_session uuid references class_sessions(id) on delete set null,
  completed_on      date
);

create table homework (
  id                uuid primary key default gen_random_uuid(),
  class_subject_id  uuid not null references class_subjects(id) on delete cascade,
  session_id        uuid references class_sessions(id) on delete set null,
  title             text not null,
  details           text,
  due_date          date,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

create table notes (
  id                uuid primary key default gen_random_uuid(),
  class_subject_id  uuid not null references class_subjects(id) on delete cascade,
  title             text not null,
  chapter           text,
  file_path         text not null,          -- Supabase Storage path in bucket 'notes'
  uploaded_by       uuid references profiles(id),
  is_hidden         boolean not null default false,   -- admin content review
  created_at        timestamptz not null default now()
);

create table exams (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes(id) on delete cascade,
  name         text not null,               -- 'Unit Test 2'
  exam_date    date,
  created_by   uuid references profiles(id)
);

create table exam_results (
  exam_id           uuid references exams(id) on delete cascade,
  class_subject_id  uuid references class_subjects(id) on delete cascade,
  student_id        uuid references students(profile_id) on delete cascade,
  marks             numeric(6,2),
  max_marks         numeric(6,2) not null default 100,
  is_published      boolean not null default false,   -- students/parents see only published
  updated_by        uuid references profiles(id),
  primary key (exam_id, class_subject_id, student_id)
);

-- ---------------------------------------------------------------------
-- LEAVE
-- ---------------------------------------------------------------------
create table leave_requests (
  id                     uuid primary key default gen_random_uuid(),
  requester_id           uuid not null references profiles(id),
  student_id             uuid references students(profile_id) on delete cascade, -- null = teacher leave
  from_date              date not null,
  to_date                date not null check (to_date >= from_date),
  reason                 text,
  status                 request_status not null default 'pending',
  reviewed_by            uuid references profiles(id),
  reviewed_at            timestamptz,
  substitute_teacher_id  uuid references profiles(id),
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FEES & FINANCE
-- ---------------------------------------------------------------------
create table fee_dues (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(profile_id) on delete cascade,
  title       text not null,                -- 'November tuition'
  amount      numeric(12,2) not null check (amount >= 0),
  due_date    date not null,
  status      fee_status not null default 'pending',
  created_at  timestamptz not null default now()
);

create table fee_payments (
  id           uuid primary key default gen_random_uuid(),
  due_id       uuid not null references fee_dues(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  paid_on      date not null default current_date,
  mode         text,                         -- cash / upi / bank
  reference    text,
  recorded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table expense_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text unique not null
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references expense_categories(id),
  amount       numeric(12,2) not null check (amount > 0),
  spent_on     date not null default current_date,
  note         text,
  paid_by      uuid references profiles(id),  -- which founder paid (null = institute account)
  receipt_path text,
  recorded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CHAT
-- ---------------------------------------------------------------------
create table channels (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  scope             channel_scope not null,
  visibility        channel_visibility not null default 'private',
  class_id          uuid references classes(id) on delete cascade,
  class_subject_id  uuid references class_subjects(id) on delete cascade,
  created_by        uuid references profiles(id),
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now()
);

create table channel_members (
  channel_id    uuid references channels(id) on delete cascade,
  profile_id    uuid references profiles(id) on delete cascade,
  is_moderator  boolean not null default false,
  status        member_status not null default 'active',
  joined_at     timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create table messages (
  id               bigint generated always as identity primary key,
  channel_id       uuid not null references channels(id) on delete cascade,
  sender_id        uuid not null references profiles(id),
  body             text,
  attachment_path  text,                     -- bucket 'chat'
  deleted_at       timestamptz,
  deleted_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  check (body is not null or attachment_path is not null)
);
create index on messages (channel_id, created_at desc);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS & LOGS
-- ---------------------------------------------------------------------
create table notifications (
  id            bigint generated always as identity primary key,
  recipient_id  uuid not null references profiles(id) on delete cascade,
  type          text not null,               -- 'fee_reminder', 'absent', 'low_attendance', 'class_update'
  payload       jsonb not null default '{}',
  channel       notify_channel not null default 'in_app',
  status        notify_status not null default 'queued',
  read_at       timestamptz,
  sent_at       timestamptz,
  error         text,
  dedupe_key    text unique,                 -- e.g. 'fee:<due_id>:-3' so a reminder is sent once
  created_at    timestamptz not null default now()
);
create index on notifications (recipient_id, created_at desc);

create table activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references profiles(id),
  action      text not null,                -- 'attendance.marked', 'results.published'
  entity      text,
  entity_id   text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- PERMISSION HELPERS (security definer so RLS policies don't recurse)
-- =====================================================================
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() = 'admin', false)
$$;

create or replace function is_founder() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() and exists (select 1 from founders where profile_id = auth.uid())
$$;

create or replace function is_parent_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_students where parent_id = auth.uid() and student_id = p_student)
$$;

create or replace function teaches(p_cs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_subjects where id = p_cs and teacher_id = auth.uid())
$$;

create or replace function teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_subjects where class_id = p_class and teacher_id = auth.uid())
$$;

-- Teacher sees a student only through a subject they teach that the student takes.
create or replace function teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from student_subjects ss
    join class_subjects cs on cs.id = ss.class_subject_id
    where ss.student_id = p_student and cs.teacher_id = auth.uid()
  )
$$;

create or replace function can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_student = auth.uid() or is_admin() or is_parent_of(p_student) or teaches_student(p_student)
$$;

-- Student/parent/teacher/admin access to a class-subject (timetable, notes, homework, syllabus).
create or replace function can_view_class_subject(p_cs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or teaches(p_cs) or exists (
    select 1 from student_subjects ss
    where ss.class_subject_id = p_cs
      and (ss.student_id = auth.uid() or is_parent_of(ss.student_id))
  )
$$;

create or replace function can_view_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or teaches_class(p_class) or exists (
    select 1 from students s
    where s.class_id = p_class and (s.profile_id = auth.uid() or is_parent_of(s.profile_id))
  )
$$;

-- Teacher of the subject, or the substitute assigned to this session.
create or replace function can_run_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from class_sessions s
    where s.id = p_session
      and (teaches(s.class_subject_id) or s.substitute_teacher_id = auth.uid())
  )
$$;

create or replace function can_view_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_sessions s
    where s.id = p_session
      and (can_view_class_subject(s.class_subject_id) or s.substitute_teacher_id = auth.uid())
  )
$$;

create or replace function is_channel_member(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channel_members
                 where channel_id = p_channel and profile_id = auth.uid() and status = 'active')
$$;

create or replace function can_moderate(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from channel_members
                               where channel_id = p_channel and profile_id = auth.uid()
                                 and status = 'active' and is_moderator)
$$;

create or replace function shares_channel_with(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channel_members a
    join channel_members b on b.channel_id = a.channel_id
    where a.profile_id = auth.uid() and a.status = 'active'
      and b.profile_id = p_profile and b.status = 'active'
  )
$$;

-- Today's date in the institute timezone (attendance edit window, live status).
create or replace function institute_today() returns date
language sql stable as $$
  select (now() at time zone (select timezone from institute_settings))::date
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Pattern: admin can do everything; other roles get narrow policies.
-- Account creation / password reset go through an Edge Function with the
-- service role key (bypasses RLS) — never from the browser.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'institute_settings','profiles','profile_private','founders','classes','subjects',
    'class_subjects','students','student_subjects','parent_students','timetable_slots',
    'holidays','class_sessions','attendance','attendance_log','syllabus_topics','homework',
    'notes','exams','exam_results','leave_requests','fee_dues','fee_payments',
    'expense_categories','expenses','channels','channel_members','messages',
    'notifications','activity_logs']
  loop
    execute format('alter table %I enable row level security', t);
    -- founders/finance tables get founder-only policies below instead
    if t not in ('founders','expenses','expense_categories') then
      execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
    end if;
  end loop;
end $$;

-- Settings / reference data: readable by any signed-in user
create policy read_all on institute_settings for select using (auth.uid() is not null);
create policy read_all on subjects           for select using (auth.uid() is not null);
create policy read_all on holidays           for select using (auth.uid() is not null);

-- Profiles: self, staff are visible to everyone, students only to those allowed
create policy read_profiles on profiles for select using (
  id = auth.uid()
  or role in ('admin','teacher')
  or (role = 'student' and (can_view_student(id) or shares_channel_with(id)))
  or (role = 'parent'  and exists (select 1 from parent_students ps
                                   where ps.parent_id = profiles.id and teaches_student(ps.student_id)))
);
create policy own_private on profile_private for select using (profile_id = auth.uid());

-- Founders & finance: founders only
create policy founders_all on founders           for all using (is_founder()) with check (is_founder());
create policy founders_read on founders          for select using (is_admin());
create policy founders_all on expenses           for all using (is_founder()) with check (is_founder());
create policy founders_all on expense_categories for all using (is_founder()) with check (is_founder());

-- Classes & enrollment
create policy read_classes      on classes          for select using (can_view_class(id));
create policy read_cs           on class_subjects   for select using (can_view_class(class_id));
create policy read_students     on students         for select using (can_view_student(profile_id));
create policy read_enrollment   on student_subjects for select using (can_view_student(student_id));
create policy read_parent_links on parent_students  for select using (parent_id = auth.uid() or can_view_student(student_id));

-- Timetable & sessions: visible to everyone linked to the class-subject
create policy read_slots    on timetable_slots for select using (can_view_class_subject(class_subject_id));
create policy read_sessions on class_sessions  for select using (can_view_class_subject(class_subject_id)
                                                                 or substitute_teacher_id = auth.uid());
-- Teacher (or substitute) updates status / topic of their own sessions
create policy teacher_update_session on class_sessions for update
  using (teaches(class_subject_id) or substitute_teacher_id = auth.uid())
  with check (teaches(class_subject_id) or substitute_teacher_id = auth.uid());
-- Teacher can add an extra class for their own subject
create policy teacher_add_session on class_sessions for insert
  with check (teaches(class_subject_id) and slot_id is null);

-- Attendance: read by anyone who can see the student; written by the session's teacher
-- within the edit window (admin can always edit via admin_all).
create policy read_attendance on attendance for select using (can_view_student(student_id));
create policy teacher_mark on attendance for insert with check (
  can_run_session(session_id) and teaches_student(student_id)
  and exists (select 1 from class_sessions s where s.id = session_id
              and s.session_date >= institute_today() - (select attendance_edit_days from institute_settings))
);
create policy teacher_edit on attendance for update using (
  can_run_session(session_id)
  and exists (select 1 from class_sessions s where s.id = session_id
              and s.session_date >= institute_today() - (select attendance_edit_days from institute_settings))
);
create policy read_att_log on attendance_log for select using (is_admin());

-- Syllabus / homework / notes
create policy read_syllabus on syllabus_topics for select using (can_view_class_subject(class_subject_id));
create policy teacher_syllabus on syllabus_topics for all
  using (teaches(class_subject_id)) with check (teaches(class_subject_id));

create policy read_homework on homework for select using (can_view_class_subject(class_subject_id));
create policy teacher_homework on homework for all
  using (teaches(class_subject_id)) with check (teaches(class_subject_id));

create policy read_notes on notes for select using (
  can_view_class_subject(class_subject_id) and (not is_hidden or teaches(class_subject_id)));
create policy teacher_notes on notes for all
  using (teaches(class_subject_id)) with check (teaches(class_subject_id));

-- Exams & results: draft results only visible to the subject teacher
create policy read_exams on exams for select using (can_view_class(class_id));
create policy teacher_exams on exams for insert with check (teaches_class(class_id));
create policy read_results on exam_results for select using (
  teaches(class_subject_id)
  or (is_published and (student_id = auth.uid() or is_parent_of(student_id))));
create policy teacher_results on exam_results for all
  using (teaches(class_subject_id)) with check (teaches(class_subject_id));

-- Leave
create policy read_leave on leave_requests for select using (
  requester_id = auth.uid()
  or (student_id is not null and can_view_student(student_id)));
create policy create_leave on leave_requests for insert with check (
  requester_id = auth.uid() and status = 'pending' and (
    (student_id is null and my_role() = 'teacher')
    or student_id = auth.uid()
    or is_parent_of(student_id)));
create policy teacher_review_leave on leave_requests for update
  using (student_id is not null and teaches_student(student_id))
  with check (student_id is not null and teaches_student(student_id));

-- Fees: student & parents read; admin manages
create policy read_fees     on fee_dues     for select using (student_id = auth.uid() or is_parent_of(student_id));
create policy read_payments on fee_payments for select using (
  exists (select 1 from fee_dues d where d.id = due_id
          and (d.student_id = auth.uid() or is_parent_of(d.student_id))));

-- Chat
create policy read_channels on channels for select using (
  is_channel_member(id) or (visibility = 'public' and not is_archived));
create policy read_members on channel_members for select using (
  profile_id = auth.uid() or is_channel_member(channel_id));
-- Join a public channel yourself; private ones need an admin/moderator
create policy join_public on channel_members for insert with check (
  profile_id = auth.uid() and not is_moderator and status = 'active'
  and exists (select 1 from channels c where c.id = channel_id and c.visibility = 'public'));
create policy request_private on channel_members for insert with check (
  profile_id = auth.uid() and not is_moderator and status = 'pending'
  and exists (select 1 from channels c where c.id = channel_id and c.visibility = 'private'));
create policy leave_channel on channel_members for delete using (profile_id = auth.uid());
create policy moderate_members on channel_members for update
  using (can_moderate(channel_id)) with check (can_moderate(channel_id));

create policy read_messages on messages for select using (is_channel_member(channel_id));
create policy send_message on messages for insert with check (
  sender_id = auth.uid() and is_channel_member(channel_id) and deleted_at is null);
-- Soft delete by sender or moderator (UI sends deleted_at/deleted_by)
create policy delete_message on messages for update
  using (sender_id = auth.uid() or can_moderate(channel_id))
  with check (sender_id = auth.uid() or can_moderate(channel_id));

-- Notifications: own only; mark as read
create policy own_notifications on notifications for select using (recipient_id = auth.uid());
create policy read_own_notification on notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Attendance change log
create or replace function log_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  new.marked_by := auth.uid();
  new.marked_at := now();
  insert into attendance_log (session_id, student_id, old_status, new_status, changed_by)
  values (new.session_id, new.student_id,
          case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  return new;
end $$;
create trigger trg_attendance_log before insert or update on attendance
for each row execute function log_attendance();

-- Absent -> in-app notification to every linked parent
create or replace function notify_absent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'absent' and (tg_op = 'INSERT' or old.status <> 'absent') then
    insert into notifications (recipient_id, type, payload, dedupe_key)
    select ps.parent_id, 'absent',
           jsonb_build_object('student_id', new.student_id, 'session_id', new.session_id),
           'absent:' || new.session_id || ':' || new.student_id || ':' || ps.parent_id
    from parent_students ps where ps.student_id = new.student_id
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
create trigger trg_notify_absent after insert or update on attendance
for each row execute function notify_absent();

-- Session stamps
create or replace function touch_session() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger trg_touch_session before update on class_sessions
for each row execute function touch_session();

-- Keep fee status in sync with payments
create or replace function sync_fee_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_due uuid := coalesce(new.due_id, old.due_id); v_paid numeric; v_amt numeric;
begin
  select coalesce(sum(amount),0) into v_paid from fee_payments where due_id = v_due;
  select amount into v_amt from fee_dues where id = v_due;
  update fee_dues set status = case
      when v_paid >= v_amt then 'paid'::fee_status
      when v_paid > 0      then 'partial'::fee_status
      when due_date < institute_today() then 'overdue'::fee_status
      else 'pending'::fee_status end
  where id = v_due and status <> 'waived';
  return null;
end $$;
create trigger trg_fee_status after insert or update or delete on fee_payments
for each row execute function sync_fee_status();

-- Approved student leave -> mark 'leave' in that student's sessions for those dates
create or replace function apply_student_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and new.student_id is not null then
    insert into attendance (session_id, student_id, status)
    select cs.id, new.student_id, 'leave'
    from class_sessions cs
    join student_subjects ss on ss.class_subject_id = cs.class_subject_id and ss.student_id = new.student_id
    where cs.session_date between new.from_date and new.to_date
    on conflict (session_id, student_id) do update set status = 'leave';
  end if;
  return new;
end $$;
create trigger trg_student_leave after update on leave_requests
for each row execute function apply_student_leave();

-- Approved teacher leave with a substitute -> assign substitute to their sessions
create or replace function apply_teacher_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved'
     and new.student_id is null and new.substitute_teacher_id is not null then
    update class_sessions s set substitute_teacher_id = new.substitute_teacher_id
    from class_subjects c
    where c.id = s.class_subject_id and c.teacher_id = new.requester_id
      and s.session_date between new.from_date and new.to_date;
  end if;
  return new;
end $$;
create trigger trg_teacher_leave after update on leave_requests
for each row execute function apply_teacher_leave();

-- New student enrolled in a subject -> auto-join class + subject channels
create or replace function auto_join_channels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into channel_members (channel_id, profile_id)
  select ch.id, new.student_id from channels ch
  join class_subjects cs on cs.id = new.class_subject_id
  where (ch.scope = 'subject' and ch.class_subject_id = new.class_subject_id)
     or (ch.scope = 'class'   and ch.class_id = cs.class_id)
     or  ch.scope = 'institute'
  on conflict do nothing;
  return new;
end $$;
create trigger trg_auto_join after insert on student_subjects
for each row execute function auto_join_channels();

-- New class-subject -> create its subject channel with the teacher as moderator
create or replace function create_subject_channel() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ch uuid;
begin
  insert into channels (name, scope, class_id, class_subject_id)
  select c.name || ' ' || c.section || ' · ' || s.name, 'subject', new.class_id, new.id
  from classes c, subjects s where c.id = new.class_id and s.id = new.subject_id
  returning id into v_ch;
  if new.teacher_id is not null then
    insert into channel_members (channel_id, profile_id, is_moderator) values (v_ch, new.teacher_id, true);
  end if;
  return new;
end $$;
create trigger trg_subject_channel after insert on class_subjects
for each row execute function create_subject_channel();

-- New class -> create its class channel
create or replace function create_class_channel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into channels (name, scope, class_id) values (new.name || ' ' || new.section, 'class', new.id);
  return new;
end $$;
create trigger trg_class_channel after insert on classes
for each row execute function create_class_channel();

insert into channels (name, scope, visibility) values ('LearnAlaya Community', 'institute', 'public');

-- =====================================================================
-- JOBS & QUERIES (call from pg_cron / Edge Functions / the app)
-- =====================================================================

-- Create concrete sessions from the timetable, skipping holidays. Run nightly for the next 7 days.
create or replace function generate_sessions(p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into class_sessions (class_subject_id, slot_id, session_date, start_time, end_time, room)
  select t.class_subject_id, t.id, d::date, t.start_time, t.end_time, t.room
  from timetable_slots t
  cross join generate_series(p_from, p_to, interval '1 day') d
  where extract(isodow from d) = t.day_of_week
    and d::date >= t.effective_from
    and (t.effective_to is null or d::date <= t.effective_to)
    and not exists (select 1 from holidays h where h.date = d::date)
  on conflict (slot_id, session_date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- "Now / Next" card for a student (works for the student or their parent)
create or replace function now_next(p_student uuid)
returns table (kind text, session_id uuid, subject text, teacher text,
               start_time time, end_time time, status session_status, room text)
language sql stable security definer set search_path = public as $$
  with ctx as (
    select (now() at time zone (select timezone from institute_settings)) as ts
  ), today as (
    select s.*, sub.name as subject_name,
           coalesce(st.full_name, t.full_name) as teacher_name
    from class_sessions s
    join class_subjects cs on cs.id = s.class_subject_id
    join subjects sub      on sub.id = cs.subject_id
    join student_subjects ss on ss.class_subject_id = cs.id and ss.student_id = p_student
    left join profiles t   on t.id = cs.teacher_id
    left join profiles st  on st.id = s.substitute_teacher_id
    , ctx
    where can_view_student(p_student)
      and s.session_date = ctx.ts::date
      and s.status <> 'cancelled'
  )
  (select 'now', id, subject_name, teacher_name, start_time, end_time, status, room
   from today, ctx where ctx.ts::time between start_time and end_time
   order by start_time limit 1)
  union all
  (select 'next', id, subject_name, teacher_name, start_time, end_time, status, room
   from today, ctx where start_time > ctx.ts::time
   order by start_time limit 1)
$$;

-- Attendance % per student per subject (low-attendance flag compares with settings)
create or replace view attendance_summary with (security_invoker = true) as
select a.student_id, cs.id as class_subject_id, sub.name as subject,
       count(*) filter (where a.status in ('present','late')) as attended,
       count(*) filter (where a.status <> 'leave')            as counted,
       round(100.0 * count(*) filter (where a.status in ('present','late'))
             / nullif(count(*) filter (where a.status <> 'leave'), 0), 2) as pct
from attendance a
join class_sessions s  on s.id = a.session_id
join class_subjects cs on cs.id = s.class_subject_id
join subjects sub      on sub.id = cs.subject_id
group by a.student_id, cs.id, sub.name;

-- Monthly P&L and founder split (founders only)
create or replace function founder_split(p_month date)
returns table (founder_id uuid, founder text, share_pct numeric, income numeric,
               expenses numeric, net numeric, share_amount numeric, paid_out_of_pocket numeric,
               settlement numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_from date := date_trunc('month', p_month)::date;
        v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
        v_inc numeric; v_exp numeric;
begin
  if not is_founder() then raise exception 'not allowed'; end if;
  select coalesce(sum(amount),0) into v_inc from fee_payments where paid_on >= v_from and paid_on < v_to;
  select coalesce(sum(amount),0) into v_exp from expenses     where spent_on >= v_from and spent_on < v_to;
  return query
  select f.profile_id, p.full_name, f.share_pct, v_inc, v_exp, v_inc - v_exp,
         round((v_inc - v_exp) * f.share_pct / 100, 2),
         coalesce(x.paid, 0),
         -- what this founder should receive back: their share of costs vs what they actually paid
         round(coalesce(x.paid, 0) - v_exp * f.share_pct / 100, 2)
  from founders f
  join profiles p on p.id = f.profile_id
  left join (select paid_by, sum(amount) paid from expenses
             where spent_on >= v_from and spent_on < v_to group by paid_by) x on x.paid_by = f.profile_id;
end $$;

-- Queue fee reminders for parents. Run daily; a WhatsApp sender (Edge Function)
-- later picks up rows with channel = 'whatsapp' and status = 'queued'.
create or replace function queue_fee_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_today date := institute_today(); s institute_settings;
begin
  select * into s from institute_settings;
  update fee_dues set status = 'overdue' where status = 'pending' and due_date < v_today;
  insert into notifications (recipient_id, type, channel, payload, dedupe_key)
  select ps.parent_id, 'fee_reminder', ch.c,
         jsonb_build_object('due_id', d.id, 'student_id', d.student_id, 'title', d.title,
                            'amount', d.amount - coalesce((select sum(amount) from fee_payments where due_id = d.id), 0),
                            'due_date', d.due_date, 'offset_days', v_today - d.due_date),
         'fee:' || d.id || ':' || (v_today - d.due_date) || ':' || ps.parent_id || ':' || ch.c
  from fee_dues d
  join parent_students ps on ps.student_id = d.student_id
  left join profile_private pp on pp.profile_id = ps.parent_id
  cross join lateral (values ('in_app'::notify_channel), ('whatsapp'::notify_channel)) ch(c)
  where d.status in ('pending','partial','overdue')
    and (d.due_date - v_today = any (s.fee_reminder_days_before)
         or v_today = d.due_date
         or v_today - d.due_date = any (s.fee_reminder_days_after))
    and (ch.c = 'in_app' or (pp.phone is not null and pp.whatsapp_opt_in))
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- REALTIME (chat + live class status + notifications)
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages, class_sessions, notifications;
  end if;
end $$;

-- =====================================================================
-- STORAGE (create in dashboard or here): buckets 'notes', 'chat', 'receipts', 'avatars'
-- Path convention: notes/<class_subject_id>/<file>, chat/<channel_id>/<file>
-- Storage policies should reuse can_view_class_subject() / is_channel_member().
-- =====================================================================
