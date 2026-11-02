# Knowly — Applied AI Knowledge Assistant

A standalone Next.js 16 App Router app for private, source-grounded Q&A over bounded plain-text and Markdown documents. It uses Supabase Auth/Postgres when configured and any OpenAI-compatible chat-completions provider. No LLM key or Supabase key is bundled into browser code.

## What works

- Server-verified Supabase sessions in HttpOnly cookies, authenticated ingestion, listing, and deletion.
- Plain-text / Markdown ingestion (500 KB and 40,000 characters maximum per file; 50 documents per workspace), paragraph-aware chunks, and source metadata.
- User-scoped Postgres Row Level Security for documents and chunks.
- Per-user lexical retrieval with a strict evidence gate, server-only AI completion, bounded prompts and responses, a 15-second provider timeout, and exact retrieved source passages shown as citations.
- A clearly marked local demo with synthetic sample documents. Demo uploads stay in component memory, retrieval previews quote matching source text, and **no AI answer or server upload is simulated**.
- OpenAI-compatible provider settings are server environment variables only; missing or partial configuration is reported as unavailable.
- Automated tests for chunking, retrieval, provider configuration, completion behavior, and request-body limits.

## Run locally

Requirements: Node.js 20.9+, npm, a Supabase project for authenticated storage, and (optionally) an OpenAI-compatible provider.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without environment settings, the app opens in **DEMO MODE**. It ships with synthetic sample documents and lets you test local retrieval previews. Refreshing clears documents added during the demo. Demo interactions never claim that a model answered.

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/202611010001_initial_schema.sql` in its SQL editor.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the project’s API settings in `.env.local` and in the deployment’s server environment. These are deliberately **not** `NEXT_PUBLIC_*`; the browser never receives the Supabase key. The server uses the anon key with the signed-in user session; RLS is the data boundary. Never configure a service-role key.
3. Configure Supabase Auth email/password sign-in and the site/redirect URLs for local or production use.
4. Restart the dev server, create an account or sign in, and add `.txt`, `.md`, or `.markdown` files.

The supplied migration enables RLS, restricts reads and writes to `auth.uid()`, prevents cross-user chunk ownership with a composite foreign key, and cascades document deletions.

## Configure an AI provider

Set all three server-only values to enable answers:

```dotenv
LLM_BASE_URL=https://api.example.com/v1
LLM_API_KEY=your-provider-key
LLM_MODEL=your-model-name
```

The app posts to `${LLM_BASE_URL}/chat/completions`. `LLM_BASE_URL` must be HTTPS; HTTP is accepted only for localhost development. The provider key is sent only in a server-to-server `Authorization` header. The app does not fetch embeddings or send documents to an AI service during ingestion; question-time retrieval sends only the question and a small set of matched excerpts. Choose a provider/model with appropriate data-handling terms for your use case.

Partial or invalid configuration is an explicit unavailable state. Without a provider, signed-in users can manage documents, but AI chat returns a clear configuration error rather than a fabricated answer.

## Deploy to Vercel

1. Import this standalone repository into Vercel (or run `vercel` from this folder); use the standard Next.js build and output settings. This is a server-rendered App Router app, **not** a static export.
2. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` as server environment variables in the Vercel project. Add all provider values to enable AI; omit them to deploy the secure, explicit unavailable state.
3. Configure Supabase Auth with your Vercel production URL, execute the SQL migration, and redeploy after environment changes.

The architecture uses Vercel serverless route handlers and Supabase free-tier-compatible Postgres/Auth; service limits and model-provider billing/quotas still apply. No external API or paid provider is required to run the local demo or test suite.

## Commands

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

`npm start` starts the production build. Configure live service credentials only through environment variables; never commit `.env.local`.
