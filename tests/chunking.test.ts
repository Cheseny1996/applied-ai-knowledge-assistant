import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkText,
  CHUNK_OVERLAP_CHARS,
  isSupportedDocument,
  MAX_CHUNK_CHARS,
} from "../lib/chunking";

test("chunkText normalizes newlines, trims input, and keeps stable indexes", () => {
  const chunks = chunkText("  First paragraph.\r\n\r\nSecond paragraph.  ", 24, 4);
  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1]);
  assert.match(chunks[0].content, /First paragraph/);
  assert.match(chunks[1].content, /Second paragraph/);
});

test("chunkText overlaps long content and respects configured bounds", () => {
  const source = "alpha ".repeat(600);
  const chunks = chunkText(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.content.length <= MAX_CHUNK_CHARS));
  assert.ok(chunks[1].content.length > MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS);
  assert.ok(chunks[0].content.includes(chunks[1].content.slice(0, CHUNK_OVERLAP_CHARS - 10)));
});

test("chunkText handles empty input and rejects unsafe overlap settings", () => {
  assert.deepEqual(chunkText(" \n "), []);
  assert.throws(() => chunkText("text", 20, 20), RangeError);
});

test("isSupportedDocument permits bounded text formats only", () => {
  assert.equal(isSupportedDocument("notes.md", "text/markdown"), true);
  assert.equal(isSupportedDocument("notes.TXT", ""), true);
  assert.equal(isSupportedDocument("archive.pdf", "application/pdf"), false);
  assert.equal(isSupportedDocument("notes.md", "application/pdf"), false);
});
