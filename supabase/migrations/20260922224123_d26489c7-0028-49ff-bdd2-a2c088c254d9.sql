create table public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Default key',
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.developer_api_keys TO authenticated;
GRANT ALL ON public.developer_api_keys TO service_role;

ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;

create policy "Users manage own api keys"
  on public.developer_api_keys
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);