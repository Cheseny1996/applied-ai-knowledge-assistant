import assert from "node:assert/strict";
import test from "node:test";
import { completeChat, getProviderConfig, ProviderError } from "../lib/provider";

test("provider config requires all server-side values and HTTPS endpoints", () => {
  assert.equal(getProviderConfig({}), null);
  assert.throws(
    () => getProviderConfig({ LLM_BASE_URL: "https://api.example.test/v1" }),
    (error: unknown) => error instanceof ProviderError && error.code === "unavailable",
  );
  assert.deepEqual(getProviderConfig({
    LLM_BASE_URL: "https://api.example.test/v1/",
    LLM_API_KEY: "server-only-test-key",
    LLM_MODEL: "sample-model",
  }), {
    baseUrl: "https://api.example.test/v1",
    apiKey: "server-only-test-key",
    model: "sample-model",
  });
  assert.throws(
    () => getProviderConfig({ LLM_BASE_URL: "http://remote.example/v1", LLM_API_KEY: "key", LLM_MODEL: "model" }),
    (error: unknown) => error instanceof ProviderError && error.message.includes("HTTPS"),
  );
});

test("completeChat uses an OpenAI-compatible request and returns bounded text", async () => {
  const originalFetch = globalThis.fetch;
  let observed: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    observed = init;
    return Response.json({ choices: [{ message: { content: " grounded answer ".repeat(500) } }] });
  };
  try {
    const answer = await completeChat([{ role: "user", content: "Question" }], {
      baseUrl: "https://provider.example.test/v1",
      apiKey: "test-secret",
      model: "test-model",
    });
    assert.equal(answer.length, 6_000);
    assert.equal(answer.startsWith("grounded answer"), true);
    assert.equal((observed?.headers as Record<string, string>).authorization, "Bearer test-secret");
    assert.equal((JSON.parse(String(observed?.body)) as { model: string }).model, "test-model");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("completeChat maps failed upstream responses to a generic provider error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("sensitive provider detail", { status: 500 });
  try {
    await assert.rejects(
      completeChat([{ role: "user", content: "Question" }], {
        baseUrl: "https://provider.example.test/v1",
        apiKey: "test-secret",
        model: "test-model",
      }),
      (error: unknown) => error instanceof ProviderError && error.status === 502 && !error.message.includes("sensitive"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
