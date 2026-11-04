create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  artist text not null default '' check (length(artist) <= 160),
  collection text not null default 'Louvor ICM',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  instrument text not null check (instrument in ('Bateria', 'Saxofone', 'Flauta', 'Violão', 'Teclado', 'Outro')),
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.songs enable row level security;
alter table public.scores enable row level security;
alter table public.catalog_admins enable row level security;

revoke all on public.catalog_admins from anon, authenticated;

create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.scores to authenticated;
grant select on public.songs, public.scores to anon;

create policy "Anyone can browse approved songs"
on public.songs for select
to anon, authenticated
using (status = 'approved');

create policy "Contributors can view their songs"
on public.songs for select
to authenticated
using (submitted_by = (select auth.uid()));

create policy "Signed-in users can submit songs for review"
on public.songs for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
);

create policy "Contributors can delete their pending songs"
on public.songs for delete
to authenticated
using (submitted_by = (select auth.uid()) and status = 'pending');

create policy "Catalog admins can manage songs"
on public.songs for all
to authenticated
using ((select public.is_catalog_admin()))
with check ((select public.is_catalog_admin()));

create policy "Anyone can browse approved scores"
on public.scores for select
to anon, authenticated
using (status = 'approved');

create policy "Contributors can view their scores"
on public.scores for select
to authenticated
using (submitted_by = (select auth.uid()));

create policy "Signed-in users can submit scores for review"
on public.scores for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.songs
    where songs.id = scores.song_id
      and (songs.status = 'approved' or songs.submitted_by = (select auth.uid()))
  )
);

create policy "Contributors can delete their pending scores"
on public.scores for delete
to authenticated
using (submitted_by = (select auth.uid()) and status = 'pending');

create policy "Catalog admins can manage scores"
on public.scores for all
to authenticated
using ((select public.is_catalog_admin()))
with check ((select public.is_catalog_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drum-studio-scores',
  'drum-studio-scores',
  false,
  20971520,
  array[
    'application/vnd.recordare.musicxml+xml',
    'application/vnd.recordare.musicxml',
    'application/zip',
    'application/xml',
    'text/xml',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Contributors can upload scores to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'drum-studio-scores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Approved scores and their contributors can download files"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'drum-studio-scores'
  and exists (
    select 1
    from public.scores
    where scores.storage_path = objects.name
      and (
        scores.status = 'approved'
        or scores.submitted_by = (select auth.uid())
        or (select public.is_catalog_admin())
      )
  )
);

create policy "Contributors can remove files in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'drum-studio-scores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
