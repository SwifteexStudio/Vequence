-- Vequence moderation/admin hardening
-- Apply this migration to the existing Vequence Supabase project.

alter table public.users
  add column if not exists is_admin boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists ban_reason text;

alter table public.articles
  add column if not exists article_code text;

update public.articles
set article_code = 'ART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where article_code is null;

alter table public.articles
  alter column article_code set default ('ART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  alter column article_code set not null;

create unique index if not exists articles_article_code_key on public.articles(article_code);

-- Make dependent records removable when an administrator deletes an article.
alter table public.article_tags drop constraint if exists article_tags_article_id_fkey;
alter table public.article_tags
  add constraint article_tags_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete cascade;

alter table public.sources drop constraint if exists sources_article_id_fkey;
alter table public.sources
  add constraint sources_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete cascade;

alter table public.likes drop constraint if exists likes_article_id_fkey;
alter table public.likes
  add constraint likes_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete cascade;

alter table public.bookmarks drop constraint if exists bookmarks_article_id_fkey;
alter table public.bookmarks
  add constraint bookmarks_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete cascade;

alter table public.comments drop constraint if exists comments_article_id_fkey;
alter table public.comments
  add constraint comments_article_id_fkey
  foreign key (article_id) references public.articles(id) on delete cascade;

alter table public.comments drop constraint if exists comments_parent_comment_id_fkey;
alter table public.comments
  add constraint comments_parent_comment_id_fkey
  foreign key (parent_comment_id) references public.comments(id) on delete cascade;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.is_admin from public.users u where u.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.banned_at is not null
  );
$$;

revoke all on function public.is_banned() from public;
grant execute on function public.is_banned() to authenticated;

-- Prevent normal authenticated clients from changing moderation fields through
-- the existing "update own profile" policy. Admin RPCs explicitly opt in.
create or replace function public.protect_moderation_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('vequence.admin_operation', true) is distinct from 'true' then
    new.is_admin := old.is_admin;
    new.banned_at := old.banned_at;
    new.ban_reason := old.ban_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_moderation_fields on public.users;
create trigger protect_moderation_fields
before update on public.users
for each row execute function public.protect_moderation_fields();

-- Useful admin dashboard data. All functions re-check authorization server-side.
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'users', (select count(*) from public.users),
    'banned_users', (select count(*) from public.users where banned_at is not null),
    'admins', (select count(*) from public.users where is_admin),
    'articles', (select count(*) from public.articles),
    'published_articles', (select count(*) from public.articles where status = 'published'),
    'draft_articles', (select count(*) from public.articles where status = 'draft'),
    'comments', (select count(*) from public.comments)
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_find_articles(
  p_search text default null,
  p_status text default null
)
returns table(
  id uuid,
  article_code text,
  title varchar,
  slug varchar,
  status varchar,
  category varchar,
  author_id uuid,
  author_username varchar,
  author_display_name varchar,
  created_at timestamp without time zone,
  published_at timestamp without time zone,
  updated_at timestamp without time zone,
  view_count integer,
  like_count integer,
  comment_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    a.id,
    a.article_code,
    a.title,
    a.slug,
    a.status,
    a.category,
    a.author_id,
    u.username,
    u.display_name,
    a.created_at,
    a.published_at,
    a.updated_at,
    a.view_count,
    a.like_count,
    a.comment_count
  from public.articles a
  join public.users u on u.id = a.author_id
  where
    (p_status is null or a.status = p_status)
    and (
      nullif(trim(p_search), '') is null
      or a.article_code ilike '%' || trim(p_search) || '%'
      or a.title ilike '%' || trim(p_search) || '%'
      or a.slug ilike '%' || trim(p_search) || '%'
      or u.username ilike '%' || trim(p_search) || '%'
    )
  order by coalesce(a.updated_at, a.created_at) desc
  limit 100;
end;
$$;

create or replace function public.admin_find_users(p_search text default null)
returns table(
  id uuid,
  username varchar,
  display_name varchar,
  is_admin boolean,
  banned_at timestamptz,
  ban_reason text,
  created_at timestamp without time zone,
  article_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    u.id,
    u.username,
    u.display_name,
    u.is_admin,
    u.banned_at,
    u.ban_reason,
    u.created_at,
    (select count(*) from public.articles a where a.author_id = u.id)
  from public.users u
  where
    nullif(trim(p_search), '') is null
    or u.username ilike '%' || trim(p_search) || '%'
    or coalesce(u.display_name, '') ilike '%' || trim(p_search) || '%'
  order by u.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_find_comments(p_search text default null)
returns table(
  id uuid,
  article_id uuid,
  article_code text,
  article_title varchar,
  user_id uuid,
  username varchar,
  display_name varchar,
  content text,
  created_at timestamp without time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    c.id,
    c.article_id,
    a.article_code,
    a.title,
    c.user_id,
    u.username,
    u.display_name,
    c.content,
    c.created_at
  from public.comments c
  join public.articles a on a.id = c.article_id
  join public.users u on u.id = c.user_id
  where
    nullif(trim(p_search), '') is null
    or c.content ilike '%' || trim(p_search) || '%'
    or u.username ilike '%' || trim(p_search) || '%'
    or a.article_code ilike '%' || trim(p_search) || '%'
  order by c.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_delete_article(p_article_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_code text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select a.id, a.article_code
  into target_id, target_code
  from public.articles a
  where a.article_code = upper(trim(p_article_ref))
     or a.id::text = trim(p_article_ref)
  limit 1;

  if target_id is null then
    raise exception 'article not found';
  end if;

  perform set_config('vequence.admin_operation', 'true', true);
  delete from public.articles where id = target_id;

  return jsonb_build_object('deleted', true, 'id', target_id, 'article_code', target_code);
end;
$$;

create or replace function public.admin_set_article_status(
  p_article_ref text,
  p_status text
)
returns public.articles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  result_row public.articles;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_status not in ('published', 'draft') then
    raise exception 'invalid status';
  end if;

  select a.id into target_id
  from public.articles a
  where a.article_code = upper(trim(p_article_ref))
     or a.id::text = trim(p_article_ref)
  limit 1;

  if target_id is null then
    raise exception 'article not found';
  end if;

  if p_status = 'published' then
    update public.articles
    set status = 'published',
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = target_id
    returning * into result_row;
  else
    update public.articles
    set status = 'draft',
        updated_at = now()
    where id = target_id
    returning * into result_row;
  end if;

  return result_row;
end;
$$;

create or replace function public.admin_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  delete from public.comments where id = p_comment_id;
  return found;
end;
$$;

create or replace function public.admin_set_user_banned(
  p_username text,
  p_banned boolean,
  p_reason text default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.users;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into target
  from public.users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if target.id is null then
    raise exception 'user not found';
  end if;

  if target.id = auth.uid() and p_banned then
    raise exception 'you cannot ban yourself';
  end if;

  perform set_config('vequence.admin_operation', 'true', true);

  if p_banned then
    update public.users
    set banned_at = now(),
        ban_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    where id = target.id
    returning * into target;
  else
    update public.users
    set banned_at = null,
        ban_reason = null,
        updated_at = now()
    where id = target.id
    returning * into target;
  end if;

  return target;
end;
$$;

create or replace function public.admin_set_user_admin(
  p_username text,
  p_make_admin boolean
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.users;
  admin_count bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into target
  from public.users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if target.id is null then
    raise exception 'user not found';
  end if;

  if target.id = auth.uid() and not p_make_admin then
    raise exception 'you cannot remove your own admin access';
  end if;

  if not p_make_admin then
    select count(*) into admin_count from public.users where is_admin;
    if admin_count <= 1 and target.is_admin then
      raise exception 'cannot remove the last administrator';
    end if;
  end if;

  perform set_config('vequence.admin_operation', 'true', true);
  update public.users
  set is_admin = p_make_admin,
      updated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.admin_dashboard() from public;
revoke all on function public.admin_find_articles(text,text) from public;
revoke all on function public.admin_find_users(text) from public;
revoke all on function public.admin_find_comments(text) from public;
revoke all on function public.admin_delete_article(text) from public;
revoke all on function public.admin_set_article_status(text,text) from public;
revoke all on function public.admin_delete_comment(uuid) from public;
revoke all on function public.admin_set_user_banned(text,boolean,text) from public;
revoke all on function public.admin_set_user_admin(text,boolean) from public;

grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_find_articles(text,text) to authenticated;
grant execute on function public.admin_find_users(text) to authenticated;
grant execute on function public.admin_find_comments(text) to authenticated;
grant execute on function public.admin_delete_article(text) to authenticated;
grant execute on function public.admin_set_article_status(text,text) to authenticated;
grant execute on function public.admin_delete_comment(uuid) to authenticated;
grant execute on function public.admin_set_user_banned(text,boolean,text) to authenticated;
grant execute on function public.admin_set_user_admin(text,boolean) to authenticated;

-- IMPORTANT: run this once for your first administrator, replacing the username.
-- update public.users set is_admin = true, updated_at = now() where username = 'YOUR_USERNAME';
