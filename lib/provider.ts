export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ProviderMessage = { role: "system" | "user"; content: string };

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "unavailable" | "timeout" | "upstream",
    public readonly status = 503,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function getProviderConfig(env: Record<string, string | undefined> = process.env): ProviderConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!baseUrl && !apiKey && !model) return null;
  if (!baseUrl || !apiKey || !model) {
    throw new ProviderError("AI is not configured. Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL on the server.", "unavailable");
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ProviderError("LLM_BASE_URL must be a valid HTTPS URL.", "unavailable");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new ProviderError("LLM_BASE_URL must use HTTPS except for localhost development.", "unavailable");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

export async function completeChat(
  messages: ProviderMessage[],
  config: ProviderConfig,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 800,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ProviderError("The AI provider could not complete this request. Try again shortly.", "upstream", 502);
    }
    const payload: unknown = await response.json();
    const content = (payload as {
      choices?: { message?: { content?: unknown } }[];
    })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ProviderError("The AI provider returned an empty or unsupported response.", "upstream", 502);
    }
    return content.trim().slice(0, 6_000);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderError("The AI provider timed out. Please try again.", "timeout", 504);
    }
    throw new ProviderError("The AI provider is unreachable. Please try again.", "upstream", 502);
  } finally {
    clearTimeout(timeout);
  }
}
