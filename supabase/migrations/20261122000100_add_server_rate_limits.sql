-- Server-side, atomic rate limits for public-facing operations.
-- The table and RPC are inaccessible to anon/authenticated clients.
create table if not exists public.request_rate_limits (
  bucket text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (bucket, identifier_hash)
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant all on public.request_rate_limits to service_role;

create or replace function public.consume_request_rate_limit(
  p_bucket text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket is null or length(p_bucket) = 0
     or p_identifier_hash is null or length(p_identifier_hash) = 0
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  insert into public.request_rate_limits (
    bucket, identifier_hash, window_started_at, request_count
  )
  values (p_bucket, p_identifier_hash, now(), 1)
  on conflict (bucket, identifier_hash) do update
  set
    window_started_at = case
      when public.request_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then now()
      else public.request_rate_limits.window_started_at
    end,
    request_count = case
      when public.request_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then 1
      else public.request_rate_limits.request_count + 1
    end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_request_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_request_rate_limit(text, text, integer, integer)
  to service_role;
