import { createSupabaseServerClient } from "@/lib/supabase/server";
import { KnowledgeAssistant } from "@/components/knowledge-assistant";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  let email: string | null = null;
  let documents: {
    id: string;
    name: string;
    mime_type: string;
    byte_size: number;
    created_at: string;
  }[] = [];

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      email = user.email ?? null;
      const { data } = await supabase
        .from("documents")
        .select("id, name, mime_type, byte_size, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      documents = data ?? [];
    }
  }

  return <KnowledgeAssistant
    initialEmail={email}
    initialDocuments={documents}
    databaseConfigured={Boolean(supabase)}
  />;
}
