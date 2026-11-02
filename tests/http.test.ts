import assert from "node:assert/strict";
import test from "node:test";
import { hasTrustedOrigin, readBoundedJson } from "../lib/http";

test("readBoundedJson parses JSON within a strict streaming byte limit", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "hello" }),
  });

  assert.deepEqual(await readBoundedJson(request, 64), { question: "hello" });
});

test("hasTrustedOrigin blocks cross-origin mutations", () => {
  assert.equal(hasTrustedOrigin(new Request("https://example.test/api", {
    method: "POST",
    headers: { origin: "https://example.test" },
  })), true);
  assert.equal(hasTrustedOrigin(new Request("https://example.test/api", {
    method: "POST",
    headers: { origin: "https://attacker.test" },
  })), false);
  assert.equal(hasTrustedOrigin(new Request("https://example.test/api", { method: "POST" })), true);
});

test("readBoundedJson rejects declared and streamed oversize request bodies", async () => {
  const declared = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-length": "100" },
    body: JSON.stringify({}),
  });
  await assert.rejects(readBoundedJson(declared, 10), RangeError);

  const streamed = new Request("https://example.test/api", {
    method: "POST",
    body: "x".repeat(100),
  });
  await assert.rejects(readBoundedJson(streamed, 10), RangeError);
});
