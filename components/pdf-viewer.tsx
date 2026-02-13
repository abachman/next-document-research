"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type SelectionRect = { x: number; y: number; w: number; h: number };
type PdfViewport = { width: number; height: number; transform: number[] };
type PdfRenderTask = { promise: Promise<void>; cancel?: () => void };
type PdfTextContent = object;
type PdfPage = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
  getTextContent: () => Promise<PdfTextContent>;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};
type PdfTextLayer = {
  render: () => Promise<void>;
  cancel: () => void;
};
type PdfJsModule = {
  getDocument: (src: string) => { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
  TextLayer: new (options: {
    textContentSource: PdfTextContent;
    container: HTMLElement;
    viewport: PdfViewport;
  }) => PdfTextLayer;
};

type SelectionPayload = {
  page: number;
  text: string;
  rects: SelectionRect[];
};

type SavedHighlight = {
  id: string;
  page: number;
  rects: SelectionRect[];
};

function isRenderCancelledError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { name?: string; message?: string };
  const name = maybeError.name ?? "";
  const message = maybeError.message ?? "";
  return (
    name.includes("RenderingCancelledException") ||
    name.includes("AbortException") ||
    message.includes("Rendering cancelled")
  );
}

export function PdfViewer({
  sourceUrl,
  initialPage = 1,
  focusPage,
  highlights = [],
  activeHighlightId,
  onSelection,
  onSelectionClear,
}: {
  sourceUrl: string;
  initialPage?: number;
  focusPage?: number;
  highlights?: SavedHighlight[];
  activeHighlightId?: string;
  onSelection?: (payload: SelectionPayload) => void;
  onSelectionClear?: () => void;
}) {
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const pdfJsRef = useRef<PdfJsModule | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [singlePageMode, setSinglePageMode] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [renderCycle, setRenderCycle] = useState(0);
  const selectionCaptureFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      pdfJsRef.current = pdfjs;

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

  useEffect(() => {
    if (!focusPage || !pageCount) {
      return;
    }

    const targetPage = Math.max(1, Math.min(pageCount, focusPage));
    if (pageNumber !== targetPage) {
      setPageNumber(targetPage);
    }

    if (singlePageMode) {
      return;
    }

    const host = containerRef.current;
    if (!host) {
      return;
    }

    const target = host.querySelector(
      `[data-page-number="${targetPage}"]`,
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusPage, pageCount, pageNumber, renderCycle, singlePageMode]);

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
    const renderTasks: PdfRenderTask[] = [];
    const textLayers: PdfTextLayer[] = [];
    const host = containerRef.current;
    host.innerHTML = "";

    async function render() {
      const currentPdf = activePdf;
      if (!currentPdf) {
        return;
      }

      try {
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
          wrapper.style.setProperty("--total-scale-factor", String(scale));

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          wrapper.appendChild(canvas);

          const textLayer = document.createElement("div");
          textLayer.className = "pdf-text-layer absolute inset-0 select-text";
          wrapper.appendChild(textLayer);

          host.appendChild(wrapper);

          const context = canvas.getContext("2d");
          if (!context) {
            continue;
          }

          const renderTask = page.render({ canvasContext: context, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
          if (cancelled) {
            return;
          }

          const content = await page.getTextContent();
          const pdfjs = pdfJsRef.current;
          if (!pdfjs) {
            continue;
          }

          const layer = new pdfjs.TextLayer({
            textContentSource: content,
            container: textLayer,
            viewport,
          });
          textLayers.push(layer);
          await layer.render();
        }
      } catch (error) {
        if (cancelled || isRenderCancelledError(error)) {
          return;
        }
        throw error;
      }

      if (!cancelled) {
        setRenderCycle((value) => value + 1);
      }
    }

    void render();

    return () => {
      cancelled = true;
      for (const renderTask of renderTasks) {
        renderTask.cancel?.();
      }
      for (const textLayer of textLayers) {
        textLayer.cancel();
      }
    };
  }, [pdfDocument, pagesToRender, scale]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    const wrappers = Array.from(host.querySelectorAll("[data-page-number]")) as HTMLElement[];
    for (const wrapper of wrappers) {
      const pageNumberValue = Number(wrapper.dataset.pageNumber);
      const layer = wrapper.querySelector("[data-highlight-layer]") as HTMLElement | null;
      if (layer) {
        layer.remove();
      }

      const pageHighlights = highlights.filter((highlight) => highlight.page === pageNumberValue);
      if (!pageHighlights.length) {
        continue;
      }

      const overlay = document.createElement("div");
      overlay.className = "absolute inset-0 pointer-events-none";
      overlay.dataset.highlightLayer = "true";

      for (const highlight of pageHighlights) {
        const isActive = highlight.id === activeHighlightId;
        for (const rect of highlight.rects) {
          const marker = document.createElement("div");
          marker.className = "absolute rounded";
          marker.style.left = `${rect.x * 100}%`;
          marker.style.top = `${rect.y * 100}%`;
          marker.style.width = `${rect.w * 100}%`;
          marker.style.height = `${rect.h * 100}%`;
          marker.style.background = isActive
            ? "rgba(251, 191, 36, 0.5)"
            : "rgba(250, 204, 21, 0.28)";
          marker.style.outline = isActive ? "2px solid rgba(217, 119, 6, 0.7)" : "none";
          overlay.appendChild(marker);
        }
      }

      wrapper.appendChild(overlay);
    }
  }, [activeHighlightId, highlights, pageNumber, pagesToRender, renderCycle, scale, singlePageMode]);

  useEffect(() => {
    return () => {
      if (selectionCaptureFrameRef.current !== null) {
        cancelAnimationFrame(selectionCaptureFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable || target.closest("[contenteditable='true']");
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        if (!pageCount) {
          return;
        }
        event.preventDefault();
        setPageNumber((value) => Math.min(pageCount, value + 1));
        return;
      }

      if (key === "k") {
        event.preventDefault();
        setPageNumber((value) => Math.max(1, value - 1));
      }
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [pageCount]);

  function findPageElementFromRange(range: Range) {
    const host = containerRef.current;
    if (!host) {
      return null;
    }

    const candidateNodes = [range.commonAncestorContainer, range.startContainer, range.endContainer];
    for (const node of candidateNodes) {
      const element =
        node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const pageElement = element?.closest("[data-page-number]") as HTMLElement | null;
      if (pageElement && host.contains(pageElement)) {
        return pageElement;
      }
    }

    return null;
  }

  function clampScale(nextScale: number) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(nextScale.toFixed(2))));
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectionClear?.();
      return;
    }

    const range = selection.getRangeAt(0);
    const pageElement = findPageElementFromRange(range);
    if (!pageElement) {
      onSelectionClear?.();
      return;
    }

    const textLayerElement = pageElement.querySelector(".pdf-text-layer") as HTMLElement | null;
    if (!textLayerElement) {
      onSelectionClear?.();
      return;
    }

    const pageContainsSelection =
      textLayerElement.contains(range.startContainer) ||
      textLayerElement.contains(range.endContainer) ||
      textLayerElement.contains(range.commonAncestorContainer);
    if (!pageContainsSelection) {
      onSelectionClear?.();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      onSelectionClear?.();
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((rect) => {
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        const intersectsX = rect.right > pageRect.left && rect.left < pageRect.right;
        const intersectsY = rect.bottom > pageRect.top && rect.top < pageRect.bottom;
        return intersectsX && intersectsY;
      })
      .map((rect) => ({
        x: Math.max(0, (rect.left - pageRect.left) / pageRect.width),
        y: Math.max(0, (rect.top - pageRect.top) / pageRect.height),
        w: Math.min(1, rect.width / pageRect.width),
        h: Math.min(1, rect.height / pageRect.height),
      }))
      .filter((rect) => rect.w > 0 && rect.h > 0 && rect.x < 1 && rect.y < 1);

    if (!rects.length) {
      onSelectionClear?.();
      return;
    }

    onSelection?.({
      page: Number(pageElement.dataset.pageNumber),
      text,
      rects,
    });
  }

  function scheduleCaptureSelection() {
    if (selectionCaptureFrameRef.current !== null) {
      cancelAnimationFrame(selectionCaptureFrameRef.current);
    }

    selectionCaptureFrameRef.current = requestAnimationFrame(() => {
      selectionCaptureFrameRef.current = null;
      captureSelection();
    });
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col space-y-3"
      onMouseUp={scheduleCaptureSelection}
      onKeyUp={scheduleCaptureSelection}
    >
      <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setScale((value) => clampScale(value - 0.1))}
        >
          -
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setScale((value) => clampScale(value + 0.1))}
        >
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

      <div className="min-h-0 flex-1 overflow-auto rounded border border-neutral-200 bg-neutral-100 p-3">
        <div ref={containerRef} className="min-w-0" />
      </div>
    </div>
  );
}
