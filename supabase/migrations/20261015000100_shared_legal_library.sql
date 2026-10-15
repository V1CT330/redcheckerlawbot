-- RedBot: Shared public legal library
-- Stores public legal documents separately from private user uploads.

create extension if not exists pgcrypto;

create table if not exists public.legal_library_documents (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  source_url text not null unique,
  source_domain text not null,

  document_type text not null default 'other'
    check (
      document_type in (
        'constitution',
        'act',
        'regulation',
        'judgment',
        'policy',
        'other'
      )
    ),

  content text not null,
  content_hash text not null,

  source_updated_at timestamptz,
  last_crawled_at timestamptz not null default now(),

  is_current boolean not null default true,

  search_vector tsvector generated always as (
    setweight(
      to_tsvector('english', coalesce(title, '')),
      'A'
    ) ||
    setweight(
      to_tsvector('english', coalesce(content, '')),
      'B'
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fast full-text searches.
create index if not exists legal_library_search_vector_idx
  on public.legal_library_documents
  using gin (search_vector);

create index if not exists legal_library_domain_idx
  on public.legal_library_documents (source_domain);

create index if not exists legal_library_current_idx
  on public.legal_library_documents (is_current);

-- Public users can search and read legal documents.
-- Only trusted server-side processes should update the library.
alter table public.legal_library_documents
  enable row level security;

drop policy if exists
  "Public can search shared legal library"
  on public.legal_library_documents;

create policy "Public can search shared legal library"
  on public.legal_library_documents
  for select
  to anon, authenticated
  using (true);

grant select on public.legal_library_documents
  to anon, authenticated;

grant all on public.legal_library_documents
  to service_role;

-- Search stored legal documents without Firecrawl.
create or replace function public.search_legal_library(
  query_text text,
  result_limit integer default 5
)
returns table (
  id uuid,
  title text,
  source_url text,
  source_domain text,
  document_type text,
  content text,
  source_updated_at timestamptz,
  last_crawled_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with search_query as (
    select websearch_to_tsquery(
      'english',
      left(coalesce(query_text, ''), 500)
    ) as tsq
  )

  select
    d.id,
    d.title,
    d.source_url,
    d.source_domain,
    d.document_type,
    left(d.content, 12000) as content,
    d.source_updated_at,
    d.last_crawled_at,
    ts_rank_cd(
      d.search_vector,
      search_query.tsq
    ) as rank

  from public.legal_library_documents d
  cross join search_query

  where d.is_current
    and numnode(search_query.tsq) > 0
    and d.search_vector @@ search_query.tsq

  order by
    rank desc,
    d.last_crawled_at desc

  limit greatest(
    1,
    least(coalesce(result_limit, 5), 10)
  );
$$;

grant execute
  on function public.search_legal_library(text, integer)
  to anon, authenticated, service_role;
