-- =====================================================================
-- LearnAlaya — 0004: announcements
-- Adds on top of 0001–0003 (never edit earlier files). Run once in the SQL editor.
--
-- * Admins post announcements to everyone, or only students / parents / teachers,
--   optionally limited to one class.
-- * Each announcement drops an in-app notification for the people it is meant for.
-- =====================================================================

create table announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 120),
  body        text not null check (length(trim(body)) between 1 and 2000),
  audience    text not null default 'all' check (audience in ('all', 'students', 'parents', 'teachers')),
  class_id    uuid references classes(id) on delete cascade,   -- null = whole institute
  created_by  uuid references profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on announcements (created_at desc);

alter table announcements enable row level security;
create policy admin_all on announcements for all using (is_admin()) with check (is_admin());
-- Everyone else reads what is addressed to their role, for the whole institute or a class they belong to.
create policy read_announcements on announcements for select using (
  my_role() is not null
  and (audience = 'all' or audience = my_role()::text || 's')
  and (class_id is null or can_view_class(class_id))
);

create or replace function notify_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, payload, dedupe_key)
  select p.id, 'announcement',
         jsonb_build_object('announcement_id', new.id, 'title', new.title, 'body', left(new.body, 280)),
         'announcement:' || new.id || ':' || p.id
  from profiles p
  where p.is_active
    and p.role <> 'admin'
    and (new.audience = 'all' or p.role::text || 's' = new.audience)
    and (new.class_id is null
      or (p.role = 'student' and exists (
            select 1 from students s where s.profile_id = p.id and s.class_id = new.class_id))
      or (p.role = 'parent' and exists (
            select 1 from parent_students ps join students s on s.profile_id = ps.student_id
            where ps.parent_id = p.id and s.class_id = new.class_id))
      or (p.role = 'teacher' and exists (
            select 1 from class_subjects cs where cs.teacher_id = p.id and cs.class_id = new.class_id)))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
create trigger trg_notify_announcement after insert on announcements
for each row execute function notify_announcement();
