DROP FUNCTION IF EXISTS public.match_document_chunks(vector, integer, uuid);
CREATE FUNCTION public.match_document_chunks(query_embedding vector, match_count integer DEFAULT 6)
RETURNS TABLE(id uuid, document_id uuid, content text, similarity double precision, title text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  select c.id, c.document_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity, d.title
  from public.document_chunks c
  join public.documents d on d.id = c.document_id and d.user_id = auth.uid()
  where auth.uid() is not null and c.user_id = auth.uid()
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;
REVOKE ALL ON FUNCTION public.match_document_chunks(vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector, integer) TO authenticated, service_role;