import assert from "node:assert/strict";
import test from "node:test";
import { retrieveChunks, type SearchableChunk } from "../lib/retrieval";

const chunks: SearchableChunk[] = [
  {
    id: "a1",
    documentId: "a",
    documentName: "handbook.md",
    chunkIndex: 0,
    content: "The yearly learning budget is $1,200. Manager approval is needed for conference tickets.",
  },
  {
    id: "b1",
    documentId: "b",
    documentName: "onboarding.txt",
    chunkIndex: 0,
    content: "New employees should enable multi-factor authentication on their first week.",
  },
];

test("retrieveChunks returns exact source snippets with source metadata", () => {
  assert.deepEqual(retrieveChunks("What is the learning budget?", chunks), [
    {
      documentId: "a",
      documentName: "handbook.md",
      chunkIndex: 0,
      snippet: chunks[0].content,
    },
  ]);
});

test("retrieveChunks returns no evidence for unrelated questions", () => {
  assert.deepEqual(retrieveChunks("Where are the company offices?", chunks), []);
  assert.deepEqual(retrieveChunks("the and or", chunks), []);
});

test("retrieveChunks bounds and ranks citation count", () => {
  const results = retrieveChunks("learning", [...chunks, ...chunks], 100);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.snippet.length <= 1_200));
});
