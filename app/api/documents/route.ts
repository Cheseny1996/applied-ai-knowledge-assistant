import { chunkText, isSupportedDocument, MAX_CHUNKS_PER_DOCUMENT, MAX_DOCUMENT_CHARS, MAX_DOCUMENT_BYTES } from "@/lib/chunking";
import { hasTrustedOrigin, readBoundedJson } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_DOCUMENTS_PER_USER = 50;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Document storage is not configured.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Sign in to access your documents.", 401);

  const { data, error } = await supabase
    .from("documents")
    .select("id, name, mime_type, byte_size, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return jsonError("Could not load your documents.", 500);
  return Response.json({ documents: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Cross-origin requests are not allowed.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Document storage is not configured.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Sign in to add documents.", 401);

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 200_000);
  } catch (error) {
    return jsonError(error instanceof RangeError ? error.message : "Invalid JSON request body.", error instanceof RangeError ? 413 : 400);
  }
  const input = payload as { name?: unknown; content?: unknown; mimeType?: unknown };
  if (typeof input.name !== "string" || typeof input.content !== "string" || typeof input.mimeType !== "string") {
    return jsonError("A document name, text content, and MIME type are required.", 400);
  }

  const name = input.name.trim().slice(0, 160);
  const content = input.content.replace(/\0/g, "").trim();
  if (!isSupportedDocument(name, input.mimeType)) return jsonError("Only plain text and Markdown (.txt, .md, .markdown) files are supported.", 415);
  if (!content || content.length > MAX_DOCUMENT_CHARS) return jsonError(`Documents must contain between 1 and ${MAX_DOCUMENT_CHARS.toLocaleString()} characters.`, 400);
  const byteSize = new TextEncoder().encode(content).byteLength;
  if (byteSize > MAX_DOCUMENT_BYTES) return jsonError("Document is larger than the 500 KB limit.", 413);

  const chunks = chunkText(content);
  if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) return jsonError("This document creates too many chunks.", 413);
  const { count, error: countError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) return jsonError("Could not check your document limit.", 500);
  if ((count ?? 0) >= MAX_DOCUMENTS_PER_USER) {
    return jsonError(`A workspace can contain up to ${MAX_DOCUMENTS_PER_USER} documents. Delete one to add another.`, 409);
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({ user_id: user.id, name, mime_type: input.mimeType, byte_size: byteSize })
    .select("id, name, mime_type, byte_size, created_at")
    .single();
  if (insertError || !document) return jsonError("Could not save this document.", 500);

  const { error: chunkError } = await supabase.from("document_chunks").insert(
    chunks.map((chunk) => ({
      document_id: document.id,
      user_id: user.id,
      chunk_index: chunk.index,
      content: chunk.content,
    })),
  );
  if (chunkError) {
    await supabase.from("documents").delete().eq("id", document.id);
    return jsonError("Could not index this document. No partial document was kept.", 500);
  }
  return Response.json({ document }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Cross-origin requests are not allowed.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Document storage is not configured.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Sign in to delete documents.", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return jsonError("A valid document id is required.", 400);

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return jsonError("Could not delete this document.", 500);
  if (!data) return jsonError("Document not found.", 404);
  return Response.json({ deleted: true });
}
