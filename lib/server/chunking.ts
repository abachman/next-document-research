import "server-only";

export type TextPage = {
  page: number;
  text: string;
};

export type TextChunk = {
  chunkId: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
};

function splitWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function buildChunks(
  documentId: string,
  pages: TextPage[],
  chunkSize = 260,
  overlap = 80,
) {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let carryWords: string[] = [];
  let carryStartPage: number | null = null;
  let carryEndPage: number | null = null;

  for (const page of pages) {
    const words = splitWords(page.text);
    if (!words.length) {
      continue;
    }

    for (const word of words) {
      if (carryStartPage === null) {
        carryStartPage = page.page;
      }
      carryEndPage = page.page;
      carryWords.push(word);

      if (carryWords.length >= chunkSize) {
        const text = carryWords.join(" ");
        chunks.push({
          chunkId: `${documentId}:chunk:${chunkIndex}`,
          chunkIndex,
          pageStart: carryStartPage,
          pageEnd: carryEndPage ?? carryStartPage,
          text,
        });

        chunkIndex += 1;
        carryWords = carryWords.slice(Math.max(0, chunkSize - overlap));
        carryStartPage = carryEndPage;
      }
    }
  }

  if (carryWords.length > 0 && carryStartPage !== null) {
    chunks.push({
      chunkId: `${documentId}:chunk:${chunkIndex}`,
      chunkIndex,
      pageStart: carryStartPage,
      pageEnd: carryEndPage ?? carryStartPage,
      text: carryWords.join(" "),
    });
  }

  return chunks;
}
