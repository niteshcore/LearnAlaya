-- =====================================================================
-- LearnAlaya — 0006: results, notes, class chat, leave requests
-- Adds on top of 0001–0005 (never edit earlier files). Run once in the SQL editor.
--
-- * Results: teachers create class exams, enter marks for the subjects they teach and
--   publish them; students and parents get a notification and only ever see published marks.
-- * Notes: files live in a private Storage bucket 'notes' under <class_subject_id>/…;
--   only the subject's teacher (or admin) uploads, only people who can see the note row download.
-- * Class chat: teachers join their class / subject channels as moderators automatically,
--   students leave channels when they leave a subject or class, messages are text-only,
--   rate limited and soft deletes wipe the text.
-- * Leave: students / parents ask, the student's teachers (or admin) decide; teachers ask the admin.
--   Approved leave turns past 'absent' marks into 'leave'; future classes are pre-filled in the register.
--
-- Guards use is_app_user_write() from 0005, so security definer code is never blocked.
-- =====================================================================

create or replace function try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- =====================================================================
-- RESULTS
-- =====================================================================
alter table exams        add constraint exam_name_length check (length(trim(name)) between 1 and 80) not valid;
alter table exam_results add constraint result_marks_range
  check (max_marks > 0 and max_marks <= 1000 and (marks is null or (marks >= 0 and marks <= max_marks))) not valid;

-- Teachers fix or remove exams they created (only while nothing is published).
create policy teacher_edit_exam on exams for update
  using (created_by = auth.uid() and teaches_class(class_id))
  with check (created_by = auth.uid() and teaches_class(class_id));
create policy teacher_delete_exam on exams for delete
  using (created_by = auth.uid() and teaches_class(class_id)
         and not exists (select 1 from exam_results r where r.exam_id = exams.id and r.is_published));

create or replace function guard_exam_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_app_user_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.class_id is distinct from old.class_id or new.created_by is distinct from old.created_by then
    raise exception 'An exam can''t be moved to another class.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_exam before insert or update on exams
for each row execute function guard_exam_write();

create or replace function result_fits(p_exam uuid, p_cs uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exams e
    join class_subjects cs on cs.id = p_cs and cs.class_id = e.class_id
    join student_subjects ss on ss.class_subject_id = cs.id and ss.student_id = p_student
    where e.id = p_exam
  )
$$;
revoke execute on function result_fits(uuid, uuid, uuid) from public, anon;
grant execute on function result_fits(uuid, uuid, uuid) to authenticated;

create or replace function guard_result_write() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  if not is_app_user_write() then return new; end if;
  if tg_op = 'UPDATE' and (new.exam_id, new.class_subject_id, new.student_id) is distinct from (old.exam_id, old.class_subject_id, old.student_id) then
    raise exception 'Marks can''t be moved to another exam, subject or student.' using errcode = '42501';
  end if;
  if not result_fits(new.exam_id, new.class_subject_id, new.student_id) then
    raise exception 'That student doesn''t take this subject in the exam''s class.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_result before insert or update on exam_results
for each row execute function guard_result_write();

create or replace function notify_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.is_published or (tg_op = 'UPDATE' and old.is_published) then return new; end if;
  insert into notifications (recipient_id, type, payload, dedupe_key)
  select r.id, 'result',
         jsonb_build_object('exam_id', new.exam_id, 'exam', e.name, 'class_subject_id', new.class_subject_id, 'student_id', new.student_id),
         'result:' || new.exam_id || ':' || new.class_subject_id || ':' || new.student_id || ':' || r.id
  from exams e,
       (select new.student_id as id union select ps.parent_id from parent_students ps where ps.student_id = new.student_id) r
  where e.id = new.exam_id and exists (select 1 from profiles p where p.id = r.id and p.is_active)
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create trigger trg_notify_result after insert or update on exam_results
for each row execute function notify_result();

-- =====================================================================
-- NOTES (+ Storage bucket)
-- =====================================================================
alter table notes add constraint note_text_length
  check (length(trim(title)) between 1 and 120 and length(chapter) <= 80) not valid;

create or replace function guard_note_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_app_user_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    if split_part(new.file_path, '/', 1) <> new.class_subject_id::text then
      raise exception 'The file has to be stored under its subject.' using errcode = '42501';
    end if;
  elsif (new.class_subject_id, new.file_path, new.uploaded_by) is distinct from (old.class_subject_id, old.file_path, old.uploaded_by) then
    raise exception 'Only the title, chapter and visibility of a note can change.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_note before insert or update on notes
for each row execute function guard_note_write();

create or replace function notify_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_hidden then return new; end if;
  insert into notifications (recipient_id, type, payload, dedupe_key)
  select ss.student_id, 'note',
         jsonb_build_object('note_id', new.id, 'title', new.title, 'class_subject_id', new.class_subject_id),
         'note:' || new.id || ':' || ss.student_id
  from student_subjects ss join profiles p on p.id = ss.student_id and p.is_active
  where ss.class_subject_id = new.class_subject_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create trigger trg_notify_note after insert on notes
for each row execute function notify_note();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Download: only if the matching notes row is visible (notes RLS: enrolled, not hidden, active user).
create policy learnalaya_notes_read on storage.objects for select to authenticated using (
  bucket_id = 'notes' and exists (select 1 from public.notes n where n.file_path = storage.objects.name));
-- Upload / remove: the subject's teacher or an admin, inside that subject's folder.
create policy learnalaya_notes_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'notes' and (select public.my_role()) is not null
  and (public.is_admin() or public.teaches(public.try_uuid((storage.foldername(name))[1]))));
create policy learnalaya_notes_remove on storage.objects for delete to authenticated using (
  bucket_id = 'notes' and (select public.my_role()) is not null
  and (public.is_admin() or public.teaches(public.try_uuid((storage.foldername(name))[1]))));

-- =====================================================================
-- CLASS CHAT
-- =====================================================================
create index if not exists messages_sender_recent on messages (sender_id, created_at desc);

-- Membership is managed by triggers; nobody asks to join private channels by hand.
drop policy if exists request_private on channel_members;

-- Teacher of a subject moderates its subject channel and its class channel, and is in the community channel.
create or replace function sync_teacher_channels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.teacher_id is not null and old.teacher_id is distinct from new.teacher_id then
    delete from channel_members m using channels ch
    where m.channel_id = ch.id and m.profile_id = old.teacher_id
      and (ch.class_subject_id = old.id
        or (ch.scope = 'class' and ch.class_id = old.class_id
            and not exists (select 1 from class_subjects cs where cs.class_id = old.class_id and cs.teacher_id = old.teacher_id and cs.id <> old.id)));
  end if;
  if new.teacher_id is not null then
    insert into channel_members (channel_id, profile_id, is_moderator)
    select ch.id, new.teacher_id, true from channels ch
    where ch.class_subject_id = new.id
       or (ch.scope = 'class' and ch.class_id = new.class_id)
       or ch.scope = 'institute'
    on conflict (channel_id, profile_id) do update set is_moderator = true, status = 'active';
  end if;
  return new;
end $$;
create trigger trg_teacher_channels after insert or update of teacher_id on class_subjects
for each row execute function sync_teacher_channels();

-- Student leaves a subject -> out of that subject channel; out of class channels that aren't their class any more.
create or replace function prune_student_channels(p_student uuid, p_class_subject uuid) returns void
language sql security definer set search_path = public as $$
  delete from channel_members m using channels ch
  where m.channel_id = ch.id and m.profile_id = p_student and not m.is_moderator
    and (ch.class_subject_id = p_class_subject
      or (ch.scope = 'class' and ch.class_id is distinct from (select class_id from students where profile_id = p_student)));
$$;
revoke execute on function prune_student_channels(uuid, uuid) from public, anon, authenticated;

create or replace function leave_subject_channel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform prune_student_channels(old.student_id, old.class_subject_id);
  return null;
end $$;
create trigger trg_leave_subject_channel after delete on student_subjects
for each row execute function leave_subject_channel();

create or replace function leave_class_channel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform prune_student_channels(new.profile_id, null);
  return null;
end $$;
create trigger trg_leave_class_channel after update of class_id on students
for each row execute function leave_class_channel();

-- Backfill: everyone who should already be in a channel.
insert into channel_members (channel_id, profile_id, is_moderator)
select ch.id, cs.teacher_id, true
from class_subjects cs join channels ch
  on ch.class_subject_id = cs.id or (ch.scope = 'class' and ch.class_id = cs.class_id) or ch.scope = 'institute'
where cs.teacher_id is not null
on conflict (channel_id, profile_id) do update set is_moderator = true;
insert into channel_members (channel_id, profile_id)
select ch.id, ss.student_id
from student_subjects ss
join class_subjects cs on cs.id = ss.class_subject_id
join students s on s.profile_id = ss.student_id
join channels ch on ch.class_subject_id = cs.id or (ch.scope = 'class' and ch.class_id = s.class_id) or ch.scope = 'institute'
on conflict do nothing;

alter table messages add constraint message_body_length check (length(body) <= 1000) not valid;

create or replace function guard_message_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.deleted_at is not null then
    new.body := '';
    new.attachment_path := null;
  end if;
  if not is_app_user_write() then return new; end if;
  if tg_op = 'INSERT' then
    if new.attachment_path is not null then raise exception 'Files can''t be sent in chat yet.' using errcode = '42501'; end if;
    if length(trim(coalesce(new.body, ''))) = 0 then raise exception 'Type a message first.' using errcode = '23514'; end if;
    if (select count(*) from messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
      raise exception 'You''re sending messages too fast. Wait a minute.' using errcode = '42501';
    end if;
    new.body := trim(new.body);
    new.created_at := now();
    return new;
  end if;
  if old.deleted_at is not null or new.deleted_at is null
     or (new.channel_id, new.sender_id, new.created_at) is distinct from (old.channel_id, old.sender_id, old.created_at) then
    raise exception 'Messages can only be deleted, not edited.' using errcode = '42501';
  end if;
  new.deleted_by := auth.uid();
  return new;
end $$;
create trigger trg_guard_message before insert or update on messages
for each row execute function guard_message_write();

create or replace function guard_member_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_app_user_write() and (new.channel_id, new.profile_id) is distinct from (old.channel_id, old.profile_id) then
    raise exception 'Membership can''t be moved.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_member before update on channel_members
for each row execute function guard_member_write();

-- =====================================================================
-- LEAVE
-- =====================================================================
alter table leave_requests add constraint leave_reason_length check (length(trim(reason)) between 3 and 300) not valid;
alter table leave_requests add constraint leave_span check (to_date - from_date <= 60) not valid;

create policy cancel_own_leave on leave_requests for delete
  using (requester_id = auth.uid() and status = 'pending');

create or replace function guard_leave_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if not is_app_user_write() then return new; end if;
  if tg_op = 'INSERT' then
    if new.reason is null then raise exception 'Write a short reason for the leave.' using errcode = '23514'; end if;
    if new.from_date < institute_today() - 7 then
      raise exception 'Leave can only be asked for up to 7 days back.' using errcode = '23514';
    end if;
    new.reviewed_by := null; new.reviewed_at := null; new.substitute_teacher_id := null;
    return new;
  end if;
  -- Teachers reviewing a student's leave: decision only.
  if old.status <> 'pending' or new.status not in ('approved', 'rejected')
     or (new.requester_id, new.student_id, new.from_date, new.to_date, new.reason, new.substitute_teacher_id, new.created_at)
        is distinct from (old.requester_id, old.student_id, old.from_date, old.to_date, old.reason, old.substitute_teacher_id, old.created_at) then
    raise exception 'A leave request can only be approved or rejected once.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_leave before insert or update on leave_requests
for each row execute function guard_leave_write();

-- Approved leave: classes that already happened turn 'absent' into 'leave'. Future classes are left
-- unmarked (a register with marks can't be rescheduled); the register pre-fills them instead.
create or replace function apply_student_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and new.student_id is not null then
    update attendance a set status = 'leave'
    from class_sessions cs
    where a.session_id = cs.id and a.student_id = new.student_id and a.status = 'absent'
      and cs.session_date between new.from_date and least(new.to_date, institute_today());
  end if;
  return new;
end $$;

create or replace function notify_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.student_id is not null then
      insert into notifications (recipient_id, type, payload, dedupe_key)
      select distinct cs.teacher_id, 'leave_request',
             jsonb_build_object('leave_id', new.id, 'student_id', new.student_id, 'from_date', new.from_date, 'to_date', new.to_date),
             'leave_request:' || new.id || ':' || cs.teacher_id
      from student_subjects ss join class_subjects cs on cs.id = ss.class_subject_id
      join profiles p on p.id = cs.teacher_id and p.is_active
      where ss.student_id = new.student_id
      on conflict (dedupe_key) do nothing;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into notifications (recipient_id, type, payload, dedupe_key)
    select r.id, 'leave_update',
           jsonb_build_object('leave_id', new.id, 'status', new.status, 'student_id', new.student_id, 'from_date', new.from_date, 'to_date', new.to_date),
           'leave_update:' || new.id || ':' || new.status || ':' || r.id
    from (select new.requester_id as id
          union select new.student_id where new.student_id is not null
          union select ps.parent_id from parent_students ps where ps.student_id = new.student_id) r
    where exists (select 1 from profiles p where p.id = r.id and p.is_active)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;
create trigger trg_notify_leave after insert or update on leave_requests
for each row execute function notify_leave();
