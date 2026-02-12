"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { FileText, Highlighter, NotebookPen, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  addHighlightAction,
  addNoteAction,
  ingestDocumentAction,
  semanticSearchAction,
  type ActionState,
} from "@/app/actions/documents";
import { extractPdfText, type ExtractedPdf } from "@/lib/pdf/extract-text";
import type { SearchResult, WorkspaceSnapshot } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const defaultActionState: ActionState = {
  ok: true,
  message: "",
};

const defaultSearchState: ActionState<SearchResult[]> = {
  ok: true,
  message: "",
  data: [],
};

const defaultIngestState: ActionState<{ documentId: string; chunkCount: number }> = {
  ok: true,
  message: "",
};

export function Workspace({ initialSnapshot }: { initialSnapshot: WorkspaceSnapshot }) {
  const router = useRouter();
  const [extractedPdf, setExtractedPdf] = useState<ExtractedPdf | null>(null);
  const [extractError, setExtractError] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    initialSnapshot.documents[0]?.id ?? "",
  );

  const [ingestState, ingestAction, ingestPending] = useActionState(
    ingestDocumentAction,
    defaultIngestState,
  );
  const [searchState, searchAction, searchPending] = useActionState(
    semanticSearchAction,
    defaultSearchState,
  );
  const [noteState, noteAction, notePending] = useActionState(
    addNoteAction,
    defaultActionState,
  );
  const [highlightState, highlightAction, highlightPending] = useActionState(
    addHighlightAction,
    defaultActionState,
  );

  useEffect(() => {
    if (ingestState.ok && ingestState.message) {
      setExtractedPdf(null);
      router.refresh();
    }
  }, [ingestState, router]);

  useEffect(() => {
    if ((noteState.ok && noteState.message) || (highlightState.ok && highlightState.message)) {
      router.refresh();
    }
  }, [noteState, highlightState, router]);

  const selectedDocument = useMemo(
    () =>
      initialSnapshot.documents.find((document) => document.id === selectedDocumentId) ??
      initialSnapshot.documents[0],
    [initialSnapshot.documents, selectedDocumentId],
  );

  async function onPdfSelected(file: File | null) {
    setExtractError("");
    setExtractedPdf(null);

    if (!file) {
      return;
    }

    try {
      const extracted = await extractPdfText(file);
      setExtractedPdf(extracted);
    } catch (error) {
      setExtractError(
        error instanceof Error ? error.message : "Failed to read PDF from browser.",
      );
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 bg-[#f5f4ef] p-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-full space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Ingestion</p>
          <h2 className="text-xl font-semibold text-neutral-900">Document Workspace</h2>
        </div>

        <form action={ingestAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pdf-file">PDF file</Label>
            <Input
              id="pdf-file"
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                void onPdfSelected(file);
              }}
            />
          </div>

          <input
            name="sourceName"
            type="hidden"
            value={extractedPdf?.sourceName ?? ""}
            readOnly
          />
          <input name="title" type="hidden" value={extractedPdf?.title ?? ""} readOnly />
          <input
            name="pagesJson"
            type="hidden"
            value={JSON.stringify(extractedPdf?.pages ?? [])}
            readOnly
          />

          {extractedPdf ? (
            <div className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-700">
              <div className="font-medium">{extractedPdf.title}</div>
              <div>{extractedPdf.pages.length} page(s)</div>
              <div className="line-clamp-3">
                {extractedPdf.pages[0]?.text.slice(0, 160) || "No extractable text found."}
              </div>
            </div>
          ) : null}
          {extractError ? <p className="text-xs text-red-700">{extractError}</p> : null}

          <Button disabled={!extractedPdf || ingestPending} type="submit">
            {ingestPending ? "Indexing..." : "Index Document"}
          </Button>
          {ingestState.message ? (
            <p className={`text-xs ${ingestState.ok ? "text-neutral-600" : "text-red-700"}`}>
              {ingestState.message}
            </p>
          ) : null}
        </form>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Stored documents</p>
          <ScrollArea className="h-48 rounded-md border border-neutral-200 p-2">
            <div className="space-y-2">
              {initialSnapshot.documents.map((document) => (
                <button
                  key={document.id}
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    selectedDocumentId === document.id
                      ? "border-neutral-900 bg-neutral-100"
                      : "border-neutral-200 bg-white"
                  }`}
                  onClick={() => setSelectedDocumentId(document.id)}
                  type="button"
                >
                  <div className="font-medium">{document.title}</div>
                  <div className="text-xs text-neutral-500">{document.pageCount} pages</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </Card>

      <Card className="h-full">
        <Tabs defaultValue="search" className="h-full">
          <TabsList>
            <TabsTrigger value="search">
              <Search className="mr-1 h-4 w-4" />
              Search
            </TabsTrigger>
            <TabsTrigger value="notes">
              <NotebookPen className="mr-1 h-4 w-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="highlights">
              <Highlighter className="mr-1 h-4 w-4" />
              Highlights
            </TabsTrigger>
            <TabsTrigger value="reader">
              <FileText className="mr-1 h-4 w-4" />
              Reader
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <form action={searchAction} className="space-y-3">
              <Label htmlFor="query">Semantic query</Label>
              <Input id="query" name="query" placeholder="Summarize the risk model assumptions" />
              <Input name="limit" type="number" min={1} max={20} defaultValue={8} />
              <Input
                name="documentId"
                placeholder="Optional document ID filter"
                defaultValue={selectedDocument?.id ?? ""}
              />
              <Button type="submit" disabled={searchPending}>
                {searchPending ? "Searching..." : "Run Search"}
              </Button>
            </form>

            {searchState.message ? (
              <p className={`text-xs ${searchState.ok ? "text-neutral-600" : "text-red-700"}`}>
                {searchState.message}
              </p>
            ) : null}

            <ScrollArea className="h-[420px] rounded-md border border-neutral-200 p-2">
              <div className="space-y-3">
                {searchState.data?.map((result) => (
                  <div key={result.chunkId} className="rounded-md border border-neutral-200 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge>{result.documentTitle}</Badge>
                      <Badge>
                        p.{result.pageStart}
                        {result.pageEnd !== result.pageStart ? `-${result.pageEnd}` : ""}
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-700">{result.snippet}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <form action={noteAction} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="note-document-id">Document ID</Label>
                <Input
                  id="note-document-id"
                  name="documentId"
                  defaultValue={selectedDocument?.id ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="note-page">Page</Label>
                <Input id="note-page" name="page" type="number" min={1} defaultValue={1} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="note-quote">Quote</Label>
                <Input id="note-quote" name="quote" placeholder="Optional source quote" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="note-content">Note</Label>
                <Textarea id="note-content" name="content" placeholder="Add a note..." />
              </div>
              <Button type="submit" disabled={notePending} className="w-fit">
                {notePending ? "Saving..." : "Save Note"}
              </Button>
            </form>
            {noteState.message ? (
              <p className={`text-xs ${noteState.ok ? "text-neutral-600" : "text-red-700"}`}>
                {noteState.message}
              </p>
            ) : null}

            <ScrollArea className="h-[300px] rounded-md border border-neutral-200 p-2">
              <div className="space-y-2">
                {initialSnapshot.notes.map((note) => (
                  <div key={note.id} className="rounded-md border border-neutral-200 p-2">
                    <p className="text-xs text-neutral-500">
                      {note.documentId} - page {note.page}
                    </p>
                    <p className="text-sm font-medium text-neutral-900">{note.content}</p>
                    {note.quote ? <p className="text-xs text-neutral-600">"{note.quote}"</p> : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="highlights" className="space-y-4">
            <form action={highlightAction} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="highlight-document-id">Document ID</Label>
                <Input
                  id="highlight-document-id"
                  name="documentId"
                  defaultValue={selectedDocument?.id ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="highlight-page">Page</Label>
                <Input id="highlight-page" name="page" type="number" min={1} defaultValue={1} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="highlight-color">Color</Label>
                <Input id="highlight-color" name="color" defaultValue="#facc15" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="highlight-text">Text</Label>
                <Input id="highlight-text" name="text" placeholder="Optional highlighted text" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="rects-json">Rects JSON</Label>
                <Textarea
                  id="rects-json"
                  name="rectsJson"
                  defaultValue='[{"x":0.1,"y":0.1,"w":0.2,"h":0.03}]'
                />
              </div>
              <Button type="submit" disabled={highlightPending} className="w-fit">
                {highlightPending ? "Saving..." : "Save Highlight"}
              </Button>
            </form>
            {highlightState.message ? (
              <p className={`text-xs ${highlightState.ok ? "text-neutral-600" : "text-red-700"}`}>
                {highlightState.message}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="reader">
            <div className="rounded-md border border-dashed border-neutral-300 p-8">
              <h3 className="text-lg font-semibold">PDF Reader Scaffold</h3>
              <p className="mt-2 text-sm text-neutral-600">
                This scaffold indexes PDF text in-browser and stores notes/highlights in SQLite.
                Next step is wiring canvas rendering, selection mapping, and page jump navigation.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
