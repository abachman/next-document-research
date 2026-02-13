"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type SelectionRect = { x: number; y: number; w: number; h: number };
type PdfViewport = { width: number; height: number; transform: number[] };
type PdfTextItem = { str?: string; transform: number[] };
type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};
type PdfJsModule = {
  getDocument: (src: string) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
  Util: { transform: (left: number[], right: number[]) => number[] };
};

type SelectionPayload = {
  page: number;
  text: string;
  rects: SelectionRect[];
};

export function PdfViewer({
  sourceUrl,
  initialPage = 1,
  onSelection,
}: {
  sourceUrl: string;
  initialPage?: number;
  onSelection?: (payload: SelectionPayload) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const pdfUtilRef = useRef<PdfJsModule["Util"] | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [singlePageMode, setSinglePageMode] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      pdfUtilRef.current = pdfjs.Util;

      const loadingTask = pdfjs.getDocument(sourceUrl);
      const loaded = await loadingTask.promise;
      if (cancelled) {
        return;
      }

      setPdfDocument(loaded);
      setPageCount(loaded.numPages);
      setPageNumber(Math.max(1, Math.min(loaded.numPages, initialPage)));
    }

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [initialPage, sourceUrl]);

  const pagesToRender = useMemo(() => {
    if (!pdfDocument) {
      return [];
    }

    if (singlePageMode) {
      return [pageNumber];
    }

    return Array.from({ length: pageCount }).map((_, index) => index + 1);
  }, [pageCount, pageNumber, pdfDocument, singlePageMode]);

  useEffect(() => {
    const activePdf = pdfDocument;
    if (!activePdf || !containerRef.current) {
      return;
    }

    let cancelled = false;
    const host = containerRef.current;
    host.innerHTML = "";

    async function render() {
      const currentPdf = activePdf;
      if (!currentPdf) {
        return;
      }

      for (const currentPage of pagesToRender) {
        const page = await currentPdf.getPage(currentPage);
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        const wrapper = document.createElement("div");
        wrapper.dataset.pageNumber = String(currentPage);
        wrapper.className = "relative mb-4 rounded border border-neutral-300 bg-white shadow";
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        wrapper.appendChild(canvas);

        const textLayer = document.createElement("div");
        textLayer.className = "absolute inset-0 select-text";
        textLayer.style.lineHeight = "1";
        wrapper.appendChild(textLayer);

        host.appendChild(wrapper);

        const context = canvas.getContext("2d");
        if (!context) {
          continue;
        }

        await page.render({ canvasContext: context, viewport }).promise;

        const content = await page.getTextContent();
        const util = pdfUtilRef.current;
        if (!util) {
          continue;
        }

        for (const item of content.items) {
          if (!item.str) {
            continue;
          }

          const span = document.createElement("span");
          const tx = util.transform(viewport.transform, item.transform);
          const x = tx[4];
          const y = tx[5];
          const fontSize = Math.hypot(tx[0], tx[1]);

          span.textContent = item.str;
          span.style.position = "absolute";
          span.style.left = `${x}px`;
          span.style.top = `${viewport.height - y}px`;
          span.style.fontSize = `${fontSize}px`;
          span.style.transformOrigin = "0% 0%";
          span.style.color = "transparent";
          span.style.whiteSpace = "pre";
          span.style.userSelect = "text";

          textLayer.appendChild(span);
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pagesToRender, scale]);

  function captureSelection() {
    if (!onSelection) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      return;
    }

    const range = selection.getRangeAt(0);
    const baseNode = range.commonAncestorContainer;
    const element =
      baseNode.nodeType === Node.ELEMENT_NODE
        ? (baseNode as Element)
        : baseNode.parentElement;

    const pageElement = element?.closest("[data-page-number]") as HTMLElement | null;
    if (!pageElement) {
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        w: rect.width / pageRect.width,
        h: rect.height / pageRect.height,
      }));

    onSelection({
      page: Number(pageElement.dataset.pageNumber),
      text,
      rects,
    });
  }

  return (
    <div className="space-y-3" onMouseUp={captureSelection}>
      <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setScale((value) => value - 0.1)}>
          -
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setScale((value) => value + 0.1)}>
          +
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setScale(1.2)}>
          reset zoom
        </Button>

        <Button
          type="button"
          variant={singlePageMode ? "default" : "outline"}
          size="sm"
          onClick={() => setSinglePageMode((value) => !value)}
        >
          {singlePageMode ? "single-page" : "continuous"}
        </Button>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
          >
            prev
          </Button>
          <span>
            {pageNumber} / {pageCount || 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}
          >
            next
          </Button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded border border-neutral-200 bg-neutral-100 p-3">
        <div ref={containerRef} className="mx-auto w-fit" />
      </div>
    </div>
  );
}
