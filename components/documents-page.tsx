"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  searchDocumentsAction,
  type ActionState,
  uploadDocumentAction,
} from "@/app/actions/documents";
import { TagInput } from "@/components/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentSearchHit, DocumentsPageSnapshot } from "@/lib/types";

const defaultSearchState: ActionState<DocumentSearchHit[]> = { ok: true, message: "", data: [] };

export function DocumentsPage({ initialSnapshot }: { initialSnapshot: DocumentsPageSnapshot }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [searchTagNames, setSearchTagNames] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const [uploadState, uploadAction, uploadPending] = useActionState(uploadDocumentAction, {
    ok: true,
    message: "",
  });
  const [searchState, searchAction, searchPending] = useActionState(
    searchDocumentsAction,
    defaultSearchState,
  );

  const [dragActive, setDragActive] = useState(false);

  const docsById = useMemo(
    () => new Map(initialSnapshot.documents.map((doc) => [doc.id, doc])),
    [initialSnapshot.documents],
  );

  const filteredDocuments = useMemo(() => {
    if (!filterTags.length) {
      return initialSnapshot.documents;
    }

    return initialSnapshot.documents.filter((doc) => filterTags.every((tag) => doc.tags.includes(tag)));
  }, [filterTags, initialSnapshot.documents]);

  const searchRows = useMemo(() => {
    if (!searchState.data?.length) {
      return [];
    }

    return searchState.data
      .map((hit) => {
        const base = docsById.get(hit.documentId);
        if (!base) {
          return null;
        }

        return {
          ...base,
          hit,
        };
      })
      .filter((value): value is (typeof filteredDocuments)[number] & { hit: DocumentSearchHit } => value !== null);
  }, [docsById, searchState.data]);

  const tableRows = searchRows.length ? searchRows : filteredDocuments;

  useEffect(() => {
    if (uploadState.ok && uploadState.data?.documentId) {
      router.refresh();
    }
  }, [router, uploadState.data?.documentId, uploadState.ok]);

  return (
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[360px_1fr]">
      <Card className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Document Management</h1>
          <p className="text-sm text-neutral-600">Upload, organize, and search all documents.</p>
        </div>

        <form action={uploadAction} className="space-y-3">
          <div
            className={`rounded-md border-2 border-dashed p-4 text-center text-sm ${
              dragActive ? "border-neutral-900 bg-neutral-100" : "border-neutral-300"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (!file || !fileInputRef.current) {
                return;
              }

              const transfer = new DataTransfer();
              transfer.items.add(file);
              fileInputRef.current.files = transfer.files;
            }}
          >
            Drag and drop PDF here
          </div>

          <Input ref={fileInputRef} name="file" type="file" accept="application/pdf" required />
          <Input name="title" placeholder="Optional title override" />
          <Textarea name="descriptionMd" placeholder="Initial markdown description" />

          <TagInput
            value={uploadTags}
            allTags={initialSnapshot.tags}
            onChange={setUploadTags}
            placeholder="Upload tags"
          />
          <input name="tagsCsv" type="hidden" value={uploadTags.join(",")} readOnly />

          <Button type="submit" disabled={uploadPending}>
            {uploadPending ? "Uploading..." : "Upload and Index"}
          </Button>
          {uploadState.message ? (
            <p className={`text-xs ${uploadState.ok ? "text-neutral-600" : "text-red-700"}`}>
              {uploadState.message}
            </p>
          ) : null}
        </form>

        <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-600">List Filters</p>
          <TagInput
            value={filterTags}
            allTags={initialSnapshot.tags}
            onChange={setFilterTags}
            placeholder="Filter documents by tag"
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <form action={searchAction} className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input name="query" placeholder="Search all documents (keyword + semantic)" />
          <Button type="submit" disabled={searchPending}>
            {searchPending ? "Searching..." : "Search"}
          </Button>
          <TagInput
            value={searchTagNames}
            allTags={initialSnapshot.tags}
            onChange={setSearchTagNames}
            placeholder="Search within tags"
          />
          <input name="tagNamesCsv" type="hidden" value={searchTagNames.join(",")} readOnly />
          <input name="mode" type="hidden" value="hybrid" readOnly />
          <input name="limit" type="hidden" value={25} readOnly />
        </form>

        {searchState.message ? (
          <p className={`text-xs ${searchState.ok ? "text-neutral-600" : "text-red-700"}`}>
            {searchState.message}
          </p>
        ) : null}

        <div className="overflow-auto rounded border border-neutral-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-100 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Bytes</th>
                <th className="px-3 py-2">Pages</th>
                <th className="px-3 py-2">Words</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                (() => {
                  const hit = "hit" in row ? (row.hit as DocumentSearchHit) : null;

                  return (
                    <tr key={row.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                      <td className="px-3 py-2">
                        <Link
                          href={hit?.page ? `/documents/${row.id}?page=${hit.page}` : `/documents/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.title}
                        </Link>
                        <p className="line-clamp-2 max-w-sm text-xs text-neutral-500">
                          {hit ? hit.snippet : row.descriptionMd}
                        </p>
                        {hit ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {hit.reasons.map((reason: "keyword" | "semantic") => (
                              <Badge key={reason}>{reason}</Badge>
                            ))}
                            {hit.page ? <Badge>p.{hit.page}</Badge> : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{row.byteSize}</td>
                      <td className="px-3 py-2">{row.pageCount}</td>
                      <td className="px-3 py-2">{row.wordCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
