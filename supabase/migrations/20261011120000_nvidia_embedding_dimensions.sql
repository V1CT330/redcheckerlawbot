
-- Switch document embeddings from 1536 to 2048 dimensions.

-- Remove the old search function and index before changing dimensions.
drop function if exists public.match_document_chunks(vector, integer, uuid);

drop index if exists public.document_chunks_embedding_idx;

-- The existing documents and chunks tables are empty.
alter table public.document_chunks
  alter column embedding type vector(2048)
  using embedding::vector(2048);

-- Recreate the similarity-search index.
create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Recreate search with the new vector dimension.
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
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where (filter_user is null or c.user_id = filter_user)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Preserve the existing function permissions.
revoke all on function public.match_document_chunks(vector, integer, uuid)
  from public;

grant execute on function public.match_document_chunks(vector, integer, uuid)
  to authenticated, service_role;
