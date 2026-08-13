create extension if not exists postgis with schema extensions;

create type public.infrastructure_category as enum (
  'road', 'bridge', 'building', 'drainage', 'flood-control', 'facility', 'unknown'
);
create type public.report_status as enum ('unverified', 'resolved', 'hidden');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'citizen' check (role in ('citizen', 'moderator')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id text primary key,
  source text not null,
  source_url text not null,
  name text not null,
  category public.infrastructure_category not null,
  description text not null default '',
  agency text not null default '',
  contractor text,
  budget numeric check (budget >= 0),
  status text not null,
  progress numeric check (progress between 0 and 100),
  location text not null,
  coordinates extensions.geography(point, 4326) not null,
  last_checked timestamptz not null default now(),
  documents jsonb not null default '[]'::jsonb
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 80),
  note text not null check (char_length(note) between 5 and 2000),
  photo_path text,
  coordinates extensions.geography(point, 4326) not null,
  status public.report_status not null default 'unverified',
  created_at timestamptz not null default now()
);

create table public.moderation_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  action public.report_status not null,
  reason text,
  created_at timestamptz not null default now()
);
