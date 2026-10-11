
drop function if exists public.match_document_chunks(vector, integer, uuid);

drop index if exists public.document_chunks_embedding_idx;

alter table public.document_chunks
  alter column embedding type vector(2048)
  using embedding::vector(2048);

create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw ((embedding::halfvec(2048)) halfvec_cosine_ops);

create function public.match_document_chunks(
  query_embedding vector(2048),
  match_count int default 6,
  filter_user uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  title text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (
      c.embedding::halfvec(2048)
      <=> query_embedding::halfvec(2048)
    ) as similarity,
    d.title
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where (filter_user is null or c.user_id = filter_user)
  order by
    c.embedding::halfvec(2048)
    <=> query_embedding::halfvec(2048)
  limit match_count;
$$;

revoke all on function public.match_document_chunks(vector, integer, uuid)
  from public;

grant execute on function public.match_document_chunks(vector, integer, uuid)
  to authenticated, service_role;
