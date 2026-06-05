-- Zepto MCP OAuth tokens (server-only; never exposed to the browser)
create table if not exists public.zepto_connections (
  id uuid primary key default gen_random_uuid(),
  connection_key text not null unique,
  user_id uuid references public.profiles (id) on delete set null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zepto_connections_user_id_idx
  on public.zepto_connections (user_id)
  where user_id is not null;

alter table public.zepto_connections enable row level security;

-- No client policies — only service role reads/writes tokens
