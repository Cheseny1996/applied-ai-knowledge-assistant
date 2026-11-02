import { hasTrustedOrigin, readBoundedJson } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Cross-origin requests are not allowed.", 403);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError("Authentication is not configured.", 503);

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 4_000);
  } catch (error) {
    return jsonError(error instanceof RangeError ? error.message : "Invalid JSON request body.", error instanceof RangeError ? 413 : 400);
  }
  const input = payload as { action?: unknown; email?: unknown; password?: unknown };
  if (input.action === "sign-out") {
    await supabase.auth.signOut();
    return Response.json({ signedOut: true }, { headers: { "cache-control": "no-store" } });
  }
  if ((input.action !== "sign-in" && input.action !== "sign-up")
    || typeof input.email !== "string"
    || typeof input.password !== "string"
    || input.email.length > 254
    || input.password.length < 8
    || input.password.length > 128) {
    return jsonError("Enter a valid email address and a password between 8 and 128 characters.", 400);
  }

  const result = input.action === "sign-in"
    ? await supabase.auth.signInWithPassword({ email: input.email.trim(), password: input.password })
    : await supabase.auth.signUp({ email: input.email.trim(), password: input.password });
  if (result.error) {
    return jsonError(result.error.message, 400);
  }
  return Response.json({
    email: result.data.user?.email ?? input.email.trim(),
    authenticated: Boolean(result.data.session),
    confirmationRequired: input.action === "sign-up" && !result.data.session,
  }, { headers: { "cache-control": "no-store" } });
}
