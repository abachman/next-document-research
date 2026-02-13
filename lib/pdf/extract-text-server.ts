import "server-only";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

export type ExtractedPdfServer = {
  pages: Array<{ page: number; text: string }>;
  pageCount: number;
  wordCount: number;
  fullText: string;
};

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

let workerConfigured = false;

function configurePdfParseWorker() {
  if (workerConfigured) {
    return;
  }

  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "pdf-parse",
    "cjs",
    "pdf.worker.mjs",
  );

  PDFParse.setWorker(pathToFileURL(workerPath).toString());
  workerConfigured = true;
}

export async function extractPdfTextFromBytes(buffer: Buffer): Promise<ExtractedPdfServer> {
  configurePdfParseWorker();

  const parser = new PDFParse(
    {
      data: new Uint8Array(buffer),
      disableWorker: true,
      useWorkerFetch: false,
    } as unknown as ConstructorParameters<typeof PDFParse>[0],
  );

  try {
    const result = await parser.getText();
    const pages = result.pages.map((page) => ({
      page: page.num,
      text: page.text.trim(),
    }));
    const fullText = result.text || pages.map((page) => page.text).join("\n\n");

    return {
      pages,
      pageCount: result.total || pages.length,
      wordCount: countWords(fullText),
      fullText,
    };
  } finally {
    await parser.destroy();
  }
}
