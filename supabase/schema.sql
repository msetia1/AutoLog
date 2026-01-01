-- Autolog Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Users table (stores GitHub OAuth data)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  github_id bigint unique not null,
  email text not null,
  name text not null,
  avatar_url text,
  access_token text not null,
  created_at timestamp with time zone default now()
);

-- Repos table
create table if not exists repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  owner text not null,
  name text not null,
  last_changelog_commit_sha text,
  created_at timestamp with time zone default now(),
  unique(user_id, owner, name)
);

-- Changelog entries table
create table if not exists changelog_entries (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid references repos(id) on delete cascade not null,
  date date not null,
  content text not null,
  published boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes for faster lookups
create index if not exists idx_changelog_entries_repo_date on changelog_entries(repo_id, date desc);
create index if not exists idx_repos_user on repos(user_id);

-- Enable RLS (Row Level Security)
alter table users enable row level security;
alter table repos enable row level security;
alter table changelog_entries enable row level security;
