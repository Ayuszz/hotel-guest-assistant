-- Conversation threads and messages for the hotel guest assistant.
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  slots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  envelope jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- The backend talks to these tables with the service-role key, which bypasses RLS.
-- Policies here are defense-in-depth in case a client ever queries with the anon key.
drop policy if exists conversations_owner_select on public.conversations;
create policy conversations_owner_select on public.conversations
  for select using (auth.uid() = user_id);

drop policy if exists conversations_owner_insert on public.conversations;
create policy conversations_owner_insert on public.conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists conversations_owner_update on public.conversations;
create policy conversations_owner_update on public.conversations
  for update using (auth.uid() = user_id);

drop policy if exists conversations_owner_delete on public.conversations;
create policy conversations_owner_delete on public.conversations
  for delete using (auth.uid() = user_id);

drop policy if exists messages_owner_select on public.messages;
create policy messages_owner_select on public.messages
  for select using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
  ));

drop policy if exists messages_owner_insert on public.messages;
create policy messages_owner_insert on public.messages
  for insert with check (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()
  ));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- Bookings: a guest's confirmed reservation against a checkAvailability() result, plus a simulated payment.
-- No real money moves; payment_status is set by a mock "Pay now" step. inventory.json stays the read-only
-- source of truth for availability, so a booking here does not decrement it for other guests.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  room_id text not null,
  room_name text not null,
  check_in date not null,
  check_out date not null,
  nights integer not null check (nights > 0),
  adults integer not null check (adults > 0),
  price_per_night numeric not null,
  total_price numeric not null,
  currency text not null default 'INR',
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_user_id_created_at_idx
  on public.bookings (user_id, created_at desc);

alter table public.bookings enable row level security;

drop policy if exists bookings_owner_select on public.bookings;
create policy bookings_owner_select on public.bookings
  for select using (auth.uid() = user_id);

drop policy if exists bookings_owner_insert on public.bookings;
create policy bookings_owner_insert on public.bookings
  for insert with check (auth.uid() = user_id);

drop policy if exists bookings_owner_update on public.bookings;
create policy bookings_owner_update on public.bookings
  for update using (auth.uid() = user_id);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();
