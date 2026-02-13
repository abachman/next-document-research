"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createNoteFromSelectionAction,
  updateDocumentDescriptionAction,
  updateDocumentTagsAction,
  type ActionState,
} from "@/app/actions/documents";
import { MarkdownPreview } from "@/components/markdown-preview";
import { PdfViewer } from "@/components/pdf-viewer";
import { TagInput } from "@/components/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentDetailSnapshot } from "@/lib/types";

const defaultActionState: ActionState = { ok: true, message: "" };
const defaultNoteState: ActionState<{ noteId: string }> = { ok: true, message: "" };

export function DocumentInteractionPage({
  snapshot,
  initialPage = 1,
}: {
  snapshot: DocumentDetailSnapshot;
  initialPage?: number;
}) {
  const router = useRouter();
  const [descriptionMd, setDescriptionMd] = useState(snapshot.document.descriptionMd);
  const [documentTags, setDocumentTags] = useState(snapshot.tags);

  const [notePage, setNotePage] = useState(initialPage);
  const [noteQuote, setNoteQuote] = useState("");
  const [noteSelectionRects, setNoteSelectionRects] = useState("[]");
  const [noteContentMd, setNoteContentMd] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [linkedDocumentIds, setLinkedDocumentIds] = useState<string[]>([]);

  const [descriptionState, descriptionAction, descriptionPending] = useActionState(
    updateDocumentDescriptionAction,
    defaultActionState,
  );
  const [documentTagState, documentTagAction, documentTagPending] = useActionState(
    updateDocumentTagsAction,
    defaultActionState,
  );
  const [noteState, noteAction, notePending] = useActionState(
    createNoteFromSelectionAction,
    defaultNoteState,
  );

  useEffect(() => {
    if (descriptionState.ok && descriptionState.message) {
      router.refresh();
    }
  }, [descriptionState.message, descriptionState.ok, router]);

  useEffect(() => {
    if (documentTagState.ok && documentTagState.message) {
      router.refresh();
    }
  }, [documentTagState.message, documentTagState.ok, router]);

  useEffect(() => {
    if (noteState.ok && noteState.message) {
      router.refresh();
    }
  }, [noteState.message, noteState.ok, router]);

  const mentionMatches = useMemo(() => {
    const match = noteContentMd.match(/(?:^|\s)@([a-zA-Z0-9_-]{1,60})$/);
    if (!match) {
      return [];
    }

    const query = match[1].toLowerCase();
    return snapshot.allDocuments
      .filter((doc) => doc.id !== snapshot.document.id)
      .filter((doc) => doc.title.toLowerCase().includes(query))
      .slice(0, 6);
  }, [noteContentMd, snapshot.allDocuments, snapshot.document.id]);

  function insertMention(documentId: string, title: string) {
    const match = noteContentMd.match(/(?:^|\s)@([a-zA-Z0-9_-]{1,60})$/);
    if (!match) {
      return;
    }

    const replacement = ` [${title}](doc://${documentId})`;
    const updated = noteContentMd.replace(/(?:^|\s)@([a-zA-Z0-9_-]{1,60})$/, replacement);
    setNoteContentMd(updated);
    setLinkedDocumentIds((current) => [...new Set([...current, documentId])]);
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{snapshot.document.title}</h1>
            <p className="text-sm text-neutral-600">
              {snapshot.document.pageCount} pages, {snapshot.document.wordCount} words
            </p>
          </div>
          <Link href="/documents" className="text-sm underline">
            Back to documents
          </Link>
        </div>

        <PdfViewer
          sourceUrl={`/documents/files/${snapshot.document.id}`}
          initialPage={initialPage}
          onSelection={(selection) => {
            setNotePage(selection.page);
            setNoteQuote(selection.text);
            setNoteSelectionRects(JSON.stringify(selection.rects));
          }}
        />
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Description (Markdown)</h2>
          <form action={descriptionAction} className="space-y-2">
            <input name="documentId" type="hidden" value={snapshot.document.id} readOnly />
            <Textarea
              name="descriptionMd"
              value={descriptionMd}
              onChange={(event) => setDescriptionMd(event.currentTarget.value)}
              rows={8}
            />
            <Button type="submit" disabled={descriptionPending}>
              {descriptionPending ? "Saving..." : "Save Description"}
            </Button>
          </form>
          {descriptionState.message ? (
            <p className={`text-xs ${descriptionState.ok ? "text-neutral-600" : "text-red-700"}`}>
              {descriptionState.message}
            </p>
          ) : null}
          <div className="rounded border border-neutral-200 bg-neutral-50 p-2">
            <MarkdownPreview value={descriptionMd} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Document Tags</h2>
          <form action={documentTagAction} className="space-y-2">
            <input name="documentId" type="hidden" value={snapshot.document.id} readOnly />
            <TagInput value={documentTags} allTags={snapshot.allTags} onChange={setDocumentTags} />
            <input name="tagsCsv" type="hidden" value={documentTags.join(",")} readOnly />
            <Button type="submit" disabled={documentTagPending}>
              {documentTagPending ? "Saving..." : "Save Tags"}
            </Button>
          </form>
          {documentTagState.message ? (
            <p className={`text-xs ${documentTagState.ok ? "text-neutral-600" : "text-red-700"}`}>
              {documentTagState.message}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Note from Selection</h2>
          <form action={noteAction} className="space-y-2">
            <input name="documentId" type="hidden" value={snapshot.document.id} readOnly />
            <Input name="page" type="number" min={1} value={notePage} onChange={(e) => setNotePage(Number(e.currentTarget.value || 1))} />
            <Textarea name="quote" value={noteQuote} onChange={(event) => setNoteQuote(event.currentTarget.value)} />
            <input name="selectionRects" type="hidden" value={noteSelectionRects} readOnly />

            <Textarea
              name="contentMd"
              value={noteContentMd}
              onChange={(event) => setNoteContentMd(event.currentTarget.value)}
              placeholder="Write note markdown. Type @ to link another document."
              rows={6}
            />

            {mentionMatches.length ? (
              <div className="rounded border border-neutral-200 bg-neutral-50 p-2">
                <p className="mb-1 text-xs text-neutral-600">Mention suggestions</p>
                <div className="flex flex-wrap gap-1">
                  {mentionMatches.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="rounded border border-neutral-200 px-2 py-1 text-xs"
                      onClick={() => insertMention(doc.id, doc.title)}
                    >
                      {doc.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <TagInput
              value={noteTags}
              allTags={snapshot.allTags}
              onChange={setNoteTags}
              placeholder="Note tags"
            />
            <input name="tagsCsv" type="hidden" value={noteTags.join(",")} readOnly />
            <input name="linkedDocumentIdsCsv" type="hidden" value={linkedDocumentIds.join(",")} readOnly />

            <Button type="submit" disabled={notePending}>
              {notePending ? "Saving..." : "Create Note"}
            </Button>
          </form>

          {noteState.message ? (
            <p className={`text-xs ${noteState.ok ? "text-neutral-600" : "text-red-700"}`}>
              {noteState.message}
            </p>
          ) : null}

          <div className="max-h-96 space-y-2 overflow-auto rounded border border-neutral-200 p-2">
            {snapshot.notes.map((note) => (
              <div key={note.id} className="rounded border border-neutral-200 p-2">
                <p className="text-xs text-neutral-500">Page {note.page}</p>
                {note.quote ? <p className="mb-1 text-xs">&quot;{note.quote}&quot;</p> : null}
                <MarkdownPreview value={note.contentMd} />
                <div className="mt-2 flex flex-wrap gap-1">
                  {note.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                {note.linkedDocuments.length ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {note.linkedDocuments.map((doc) => (
                      <Link key={doc.id} href={`/documents/${doc.id}`} className="underline">
                        {doc.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
