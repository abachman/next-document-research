"use client";

export type ExtractedPdf = {
  sourceName: string;
  title: string;
  pages: Array<{ page: number; text: string }>;
};

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const { getDocument, GlobalWorkerOptions } = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;

  const pages: ExtractedPdf["pages"] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) =>
        typeof (item as { str?: unknown }).str === "string"
          ? (item as { str: string }).str.trim()
          : "",
      )
      .filter(Boolean)
      .join(" ");
    pages.push({ page: pageNumber, text });
  }

  return {
    sourceName: file.name,
    title: file.name.replace(/\.pdf$/i, "") || "Untitled",
    pages,
  };
}
