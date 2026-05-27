-- ════════════════════════════════════════════════════════
-- The Influence Wheel – Supabase Tabellen-Setup
-- Führe dieses SQL in deinem Supabase SQL-Editor aus:
-- https://app.supabase.com → SQL Editor → New query
-- ════════════════════════════════════════════════════════

-- Tabelle: polls
create table if not exists polls (
  id          text primary key,
  name        text not null default 'Abstimmung',
  question    text not null,
  options     jsonb not null,          -- string[]
  choice_mode text not null default 'single',  -- 'single' | 'multiple'
  status      text not null default 'voting',  -- 'voting' | 'closed' | 'done'
  winner      text,
  created_at  timestamptz default now()
);

-- Tabelle: votes
create table if not exists votes (
  id           uuid default gen_random_uuid() primary key,
  poll_id      text references polls(id) on delete cascade,
  option_index integer not null,
  created_at   timestamptz default now()
);

-- Row Level Security (öffentlicher Zugriff für Demo)
alter table polls enable row level security;
alter table votes enable row level security;

-- Jeder darf Polls lesen und erstellen
create policy "polls_read"   on polls for select using (true);
create policy "polls_insert" on polls for insert with check (true);
create policy "polls_update" on polls for update using (true);

-- Jeder darf Stimmen abgeben und lesen
create policy "votes_read"   on votes for select using (true);
create policy "votes_insert" on votes for insert with check (true);

-- Echtzeit aktivieren
alter publication supabase_realtime add table polls;
alter publication supabase_realtime add table votes;
