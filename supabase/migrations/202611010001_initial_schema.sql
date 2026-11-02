create extension if not exists pgcrypto;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 500000),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 1200),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index documents_user_created_idx on public.documents (user_id, created_at desc);
create index document_chunks_user_document_idx on public.document_chunks (user_id, document_id);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create policy "Users can read their own documents"
  on public.documents for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own documents"
  on public.documents for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own documents"
  on public.documents for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read their own document chunks"
  on public.document_chunks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own document chunks"
  on public.document_chunks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.documents
      where documents.id = document_id and documents.user_id = (select auth.uid())
    )
  );

grant select, insert, delete on public.documents to authenticated;
grant select, insert on public.document_chunks to authenticated;
