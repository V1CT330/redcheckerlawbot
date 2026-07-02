
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
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
language sql stable security invoker set search_path = public
as $$
  select c.id, c.document_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         d.title
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where (filter_user is null or c.user_id = filter_user)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke all on function public.match_document_chunks(vector, int, uuid) from public;
grant execute on function public.match_document_chunks(vector, int, uuid) to authenticated, service_role;
