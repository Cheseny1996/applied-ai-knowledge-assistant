export type SearchableChunk = {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  chunkIndex: number;
};

export type Citation = {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  snippet: string;
};

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "but", "can", "could", "did", "does", "for", "from", "had", "has",
  "have", "how", "into", "its", "just", "more", "most", "not", "our", "out",
  "over", "should", "some", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "under", "very", "was",
  "were", "what", "when", "where", "which", "while", "who", "will", "with",
  "would", "you", "your",
]);

function terms(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_'-]*/gu) ?? [])
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

export function retrieveChunks(
  query: string,
  chunks: SearchableChunk[],
  limit = 5,
): Citation[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0 || limit <= 0) return [];

  return chunks
    .map((chunk) => {
      const words = terms(chunk.content);
      const wordSet = new Set(words);
      const matched = queryTerms.filter((term) => wordSet.has(term));
      const score = matched.length / Math.sqrt(Math.max(words.length, 1));
      return { chunk, score, matched: matched.length };
    })
    .filter((result) => result.matched > 0)
    .sort((a, b) => b.score - a.score || a.chunk.documentName.localeCompare(b.chunk.documentName) || a.chunk.chunkIndex - b.chunk.chunkIndex)
    .slice(0, Math.min(limit, 8))
    .map(({ chunk }) => ({
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      chunkIndex: chunk.chunkIndex,
      snippet: chunk.content.slice(0, 1_200),
    }));
}
