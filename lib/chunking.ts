export type TextChunk = {
  content: string;
  index: number;
};

export const MAX_DOCUMENT_CHARS = 40_000;
export const MAX_DOCUMENT_BYTES = 500_000;
export const MAX_CHUNK_CHARS = 1_200;
export const CHUNK_OVERLAP_CHARS = 160;
export const MAX_CHUNKS_PER_DOCUMENT = 100;

export function chunkText(
  input: string,
  maxChars = MAX_CHUNK_CHARS,
  overlap = CHUNK_OVERLAP_CHARS,
): TextChunk[] {
  const text = input.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  if (maxChars <= 0 || overlap < 0 || overlap >= maxChars) {
    throw new RangeError("Chunk size must be positive and overlap smaller than chunk size.");
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const paragraphBoundary = text.lastIndexOf("\n\n", end);
      const sentenceBoundary = text.lastIndexOf(". ", end);
      const boundary = paragraphBoundary > start + maxChars * 0.55
        ? paragraphBoundary
        : sentenceBoundary > start + maxChars * 0.55
          ? sentenceBoundary + 1
          : -1;
      if (boundary > start) end = boundary;
    }

    const content = text.slice(start, end).trim();
    if (content) chunks.push({ content, index: chunks.length });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export function isSupportedDocument(name: string, mimeType: string): boolean {
  const extension = name.toLowerCase().split(".").pop();
  const allowedTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
  return (extension === "txt" || extension === "md" || extension === "markdown")
    && (!mimeType || allowedTypes.has(mimeType.toLowerCase()) || mimeType === "application/octet-stream");
}
