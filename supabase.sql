-- Incolla tutto nel SQL Editor di Supabase e premi Run.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('reel', 'topic', 'script')),
  title text not null,
  url text,
  done boolean not null default false,
  picked boolean not null default false,
  subtitle text,
  body text,
  created_at timestamptz not null default now()
);

-- per chi ha gia creato la tabella
alter table public.items add column if not exists picked boolean not null default false;
alter table public.items add column if not exists subtitle text;
alter table public.items add column if not exists body text;
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('reel', 'topic', 'script'));

create index if not exists items_client_idx on public.items(client_id);

alter table public.clients enable row level security;
alter table public.items enable row level security;

drop policy if exists "own clients" on public.clients;
create policy "own clients" on public.clients
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sync live tra browser e iPhone
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.items;
