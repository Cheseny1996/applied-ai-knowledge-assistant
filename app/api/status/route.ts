import { getProviderConfig, ProviderError } from "@/lib/provider";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let providerConfigured = false;
  let providerError: string | null = null;
  try {
    providerConfigured = Boolean(getProviderConfig());
  } catch (error) {
    providerError = error instanceof ProviderError ? error.message : "AI provider configuration is invalid.";
  }

  return Response.json({
    databaseConfigured: hasSupabaseConfig(),
    providerConfigured,
    providerError,
  }, { headers: { "cache-control": "no-store" } });
}
