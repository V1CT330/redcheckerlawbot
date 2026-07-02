
create extension if not exists vector;

-- Documents (PDF metadata)
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  page_count int,
  status text not null default 'processing',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "Users manage own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.tg_touch_updated_at();

-- Chunks + embeddings
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create policy "Users manage own chunks" on public.document_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);
create index document_chunks_doc_idx on public.document_chunks(document_id);

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
language sql stable security definer set search_path = public
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

-- Shared chats (public snapshots with forkable messages)
create table public.shared_chats (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  messages jsonb not null,
  created_at timestamptz not null default now()
);
grant select on public.shared_chats to anon;
grant select, insert, delete on public.shared_chats to authenticated;
grant all on public.shared_chats to service_role;
alter table public.shared_chats enable row level security;
create policy "Anyone can read shared chats" on public.shared_chats
  for select to anon, authenticated using (true);
create policy "Owner can create shared chats" on public.shared_chats
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owner can delete shared chats" on public.shared_chats
  for delete to authenticated using (auth.uid() = owner_id);

-- Storage policies for law-pdfs bucket (user-scoped by folder = user id)
create policy "Users read own pdfs" on storage.objects
  for select to authenticated
  using (bucket_id = 'law-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users upload own pdfs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'law-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users delete own pdfs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'law-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);
