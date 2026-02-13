"use server";

import fs from "node:fs/promises";
import path from "node:path";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { extractPdfTextFromBytes } from "@/lib/pdf/extract-text-server";
import { db } from "@/lib/server/db/client";
import { assertChromaAvailable, queryEmbeddings } from "@/lib/server/clients/chroma";
import { createEmbedding } from "@/lib/server/clients/ollama";
import {
  filterDocumentsByTagNames,
  getDocumentTagNames,
  parseTagList,
  setDocumentTags,
  setNoteLinks,
  setNoteTags,
} from "@/lib/server/documents";
import {
  chunks,
  documents,
  documentPages,
  documentTags,
  documentText,
  noteLinks,
  notes,
  noteTags,
  tags,
} from "@/lib/server/db/schema";
import { ingestDocument } from "@/lib/server/indexer";
import type { DocumentSearchHit } from "@/lib/types";

export type ActionState<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const uploadSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, "PDF file is required."),
  title: z.string().optional(),
  descriptionMd: z.string().default(""),
  tagsCsv: z.string().default(""),
});

const descriptionSchema = z.object({
  documentId: z.string().min(1),
  descriptionMd: z.string().default(""),
});

const documentTagsSchema = z.object({
  documentId: z.string().min(1),
  tagsCsv: z.string().default(""),
});

const noteSelectionSchema = z.object({
  documentId: z.string().min(1),
  page: z.coerce.number().int().positive(),
  quote: z.string().default(""),
  selectionRects: z.string().default("[]"),
  contentMd: z.string().default(""),
  tagsCsv: z.string().default(""),
  linkedDocumentIdsCsv: z.string().default(""),
});

const deleteNoteSchema = z.object({
  documentId: z.string().min(1),
  noteId: z.string().min(1),
});

const searchSchema = z.object({
  query: z.string().min(1),
  tagNamesCsv: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mode: z.enum(["hybrid"]).default("hybrid"),
});

function toTitleFromFilename(name: string) {
  return name.replace(/\.pdf$/i, "") || "Untitled";
}

function findSnippet(text: string, query: string) {
  if (!text) {
    return "";
  }

  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lower.indexOf(lowerQuery);
  if (index === -1) {
    return text.slice(0, 240);
  }

  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + lowerQuery.length + 160);
  return text.slice(start, end);
}

function parseLinkedDocIdsFromMarkdown(markdown: string) {
  const pattern = /doc:\/\/([a-zA-Z0-9-]+)/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null = pattern.exec(markdown);
  while (match) {
    ids.add(match[1]);
    match = pattern.exec(markdown);
  }
  return [...ids];
}

export async function uploadDocumentAction(
  _prevState: ActionState<{ documentId: string; chunkCount: number }>,
  formData: FormData,
): Promise<ActionState<{ documentId: string; chunkCount: number }>> {
  try {
    await assertChromaAvailable();

    const payload = uploadSchema.parse({
      file: formData.get("file"),
      title: formData.get("title")?.toString(),
      descriptionMd: formData.get("descriptionMd")?.toString() ?? "",
      tagsCsv: formData.get("tagsCsv")?.toString() ?? "",
    });

    if (!payload.file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF files are supported.");
    }

    const bytes = Buffer.from(await payload.file.arrayBuffer());
    const parsed = await extractPdfTextFromBytes(bytes);

    const documentId = crypto.randomUUID();
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    const relativePath = path.join("data", "uploads", `${documentId}.pdf`);
    const absolutePath = path.join(process.cwd(), relativePath);

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(absolutePath, bytes);

    const title = payload.title?.trim() || toTitleFromFilename(payload.file.name);

    const ingestResult = await ingestDocument({
      documentId,
      title,
      sourceName: payload.file.name,
      pages: parsed.pages,
      descriptionMd: payload.descriptionMd,
      filePath: relativePath,
      mimeType: payload.file.type || "application/pdf",
      byteSize: bytes.byteLength,
      wordCount: parsed.wordCount,
      fullText: parsed.fullText,
    });

    const tagNames = parseTagList(payload.tagsCsv);
    await setDocumentTags(documentId, tagNames);

    revalidatePath("/");
    revalidatePath("/documents");
    revalidatePath(`/documents/${documentId}`);

    return {
      ok: true,
      message: `Uploaded and indexed ${title}.`,
      data: { documentId, chunkCount: ingestResult.chunkCount },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to upload document.",
    };
  }
}

export async function updateDocumentDescriptionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = descriptionSchema.parse({
      documentId: formData.get("documentId"),
      descriptionMd: formData.get("descriptionMd") ?? "",
    });

    await db
      .update(documents)
      .set({ descriptionMd: payload.descriptionMd, updatedAt: Date.now() })
      .where(eq(documents.id, payload.documentId));

    revalidatePath("/documents");
    revalidatePath(`/documents/${payload.documentId}`);

    return { ok: true, message: "Description updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to update description.",
    };
  }
}

export async function updateDocumentTagsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = documentTagsSchema.parse({
      documentId: formData.get("documentId"),
      tagsCsv: formData.get("tagsCsv") ?? "",
    });

    const tagNames = parseTagList(payload.tagsCsv);
    await setDocumentTags(payload.documentId, tagNames);
    await db
      .update(documents)
      .set({ updatedAt: Date.now() })
      .where(eq(documents.id, payload.documentId));

    revalidatePath("/documents");
    revalidatePath(`/documents/${payload.documentId}`);
    return { ok: true, message: "Document tags updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to update tags.",
    };
  }
}

export async function createNoteFromSelectionAction(
  _prevState: ActionState<{ noteId: string }>,
  formData: FormData,
): Promise<ActionState<{ noteId: string }>> {
  try {
    const payload = noteSelectionSchema.parse({
      documentId: formData.get("documentId"),
      page: formData.get("page"),
      quote: formData.get("quote") ?? "",
      selectionRects: formData.get("selectionRects") ?? "[]",
      contentMd: formData.get("contentMd") ?? "",
      tagsCsv: formData.get("tagsCsv") ?? "",
      linkedDocumentIdsCsv: formData.get("linkedDocumentIdsCsv") ?? "",
    });

    const noteId = crypto.randomUUID();
    await db.insert(notes).values({
      id: noteId,
      documentId: payload.documentId,
      page: payload.page,
      quote: payload.quote,
      content: payload.contentMd,
      contentMd: payload.contentMd,
      selectionRectsJson: payload.selectionRects,
      createdAt: Date.now(),
    });

    const tagNames = parseTagList(payload.tagsCsv);
    await setNoteTags(noteId, tagNames);

    const linkedIds = [
      ...new Set([
        ...payload.linkedDocumentIdsCsv
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        ...parseLinkedDocIdsFromMarkdown(payload.contentMd),
      ]),
    ];
    await setNoteLinks(noteId, linkedIds);

    revalidatePath("/documents");
    revalidatePath(`/documents/${payload.documentId}`);

    return { ok: true, message: "Note saved.", data: { noteId } };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to save note.",
    };
  }
}

export async function deleteNoteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = deleteNoteSchema.parse({
      documentId: formData.get("documentId"),
      noteId: formData.get("noteId"),
    });

    const existing = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.id, payload.noteId))
      .limit(1);
    if (!existing.length) {
      return { ok: false, message: "Note not found." };
    }

    await db.delete(noteTags).where(eq(noteTags.noteId, payload.noteId));
    await db.delete(noteLinks).where(eq(noteLinks.noteId, payload.noteId));
    await db.delete(notes).where(eq(notes.id, payload.noteId));

    revalidatePath("/documents");
    revalidatePath(`/documents/${payload.documentId}`);
    return { ok: true, message: "Note deleted." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to delete note.",
    };
  }
}

export async function searchDocumentsAction(
  _prevState: ActionState<DocumentSearchHit[]>,
  formData: FormData,
): Promise<ActionState<DocumentSearchHit[]>> {
  try {
    const payload = searchSchema.parse({
      query: formData.get("query"),
      tagNamesCsv: formData.get("tagNamesCsv") ?? "",
      limit: formData.get("limit") ?? 20,
      mode: formData.get("mode") ?? "hybrid",
    });

    const normalizedQuery = payload.query.trim().toLowerCase();
    const tagNames = parseTagList(payload.tagNamesCsv);

    const filteredDocumentIds = await filterDocumentsByTagNames(tagNames);
    if (filteredDocumentIds && !filteredDocumentIds.length) {
      return { ok: true, message: "No matches found.", data: [] };
    }

    const docs = filteredDocumentIds
      ? filteredDocumentIds.length
        ? await db.select().from(documents).where(inArray(documents.id, filteredDocumentIds))
        : []
      : await db.select().from(documents);

    if (!docs.length) {
      return { ok: true, message: "No matches found.", data: [] };
    }

    const docIds = docs.map((doc) => doc.id);
    const [textRows, pageRows, tagRows] = await Promise.all([
      db.select().from(documentText).where(inArray(documentText.documentId, docIds)),
      db.select().from(documentPages).where(inArray(documentPages.documentId, docIds)),
      db
        .select({ documentId: documentTags.documentId, tagName: tags.name })
        .from(documentTags)
        .innerJoin(tags, eq(tags.id, documentTags.tagId))
        .where(inArray(documentTags.documentId, docIds)),
    ]);

    const textByDoc = new Map(textRows.map((row) => [row.documentId, row.text]));
    const pagesByDoc = new Map<string, Array<{ page: number; text: string }>>();
    for (const row of pageRows) {
      const values = pagesByDoc.get(row.documentId) ?? [];
      values.push({ page: row.page, text: row.text });
      pagesByDoc.set(row.documentId, values);
    }
    for (const values of pagesByDoc.values()) {
      values.sort((left, right) => left.page - right.page);
    }
    const docTagsByDoc = new Map<string, string[]>();
    for (const row of tagRows) {
      const values = docTagsByDoc.get(row.documentId) ?? [];
      values.push(row.tagName);
      docTagsByDoc.set(row.documentId, values);
    }

    const scores = new Map<
      string,
      { score: number; reasons: Set<"keyword" | "semantic">; snippet: string; page: number | null }
    >();

    for (const doc of docs) {
      const fullText = textByDoc.get(doc.id) ?? "";
      const description = doc.descriptionMd ?? "";
      const tagText = (docTagsByDoc.get(doc.id) ?? []).join(" ");
      const haystack = `${doc.title}\n${description}\n${tagText}\n${fullText}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        continue;
      }

      let score = 10;
      if (doc.title.toLowerCase().includes(normalizedQuery)) {
        score += 20;
      }
      if (description.toLowerCase().includes(normalizedQuery)) {
        score += 8;
      }
      if (tagText.toLowerCase().includes(normalizedQuery)) {
        score += 6;
      }
      const matchedPage =
        pagesByDoc
          .get(doc.id)
          ?.find((pageRow) => pageRow.text.toLowerCase().includes(normalizedQuery)) ?? null;
      const snippetSource = matchedPage ? matchedPage.text : `${description}\n${fullText}`;

      scores.set(doc.id, {
        score,
        reasons: new Set(["keyword"]),
        snippet: findSnippet(snippetSource, payload.query),
        page: matchedPage?.page ?? null,
      });
    }

    try {
      await assertChromaAvailable();
      const queryEmbedding = await createEmbedding(payload.query);
      const semanticRows = await queryEmbeddings({
        queryEmbedding,
        limit: Math.min(50, payload.limit * 4),
      });

      const metadatas = semanticRows.metadatas?.[0] ?? [];
      const distances = semanticRows.distances?.[0] ?? [];

      const chunkIds = metadatas
        .map((value) => value?.chunkId)
        .filter((value): value is string => typeof value === "string");

      const chunkRows = chunkIds.length
        ? await db.select().from(chunks).where(inArray(chunks.id, chunkIds))
        : [];
      const chunkById = new Map(chunkRows.map((row) => [row.id, row]));

      metadatas.forEach((metadata, index) => {
        const chunkId = metadata?.chunkId;
        if (typeof chunkId !== "string") {
          return;
        }

        const chunk = chunkById.get(chunkId);
        if (!chunk) {
          return;
        }

        if (filteredDocumentIds && !filteredDocumentIds.includes(chunk.documentId)) {
          return;
        }

        const distance = typeof distances[index] === "number" ? distances[index] : 1;
        const semanticBoost = Math.max(0, 1 - distance) * 30;

        const current =
          scores.get(chunk.documentId) ??
          ({ score: 0, reasons: new Set<"keyword" | "semantic">(), snippet: "", page: null } as const);
        const nextScore = current.score + semanticBoost;

        scores.set(chunk.documentId, {
          score: nextScore,
          reasons: new Set([...current.reasons, "semantic"]),
          snippet:
            !current.snippet || nextScore > current.score + 5
              ? chunk.text.slice(0, 240)
              : current.snippet,
          page: current.page ?? chunk.pageStart,
        });
      });
    } catch {
      // Keyword-only fallback when semantic dependencies are unavailable.
    }

    const docsById = new Map(docs.map((row) => [row.id, row]));
    const hits: DocumentSearchHit[] = [...scores.entries()]
      .map(([documentId, value]) => {
        const doc = docsById.get(documentId);
        if (!doc) {
          return null;
        }

        return {
          documentId,
          title: doc.title,
          page: value.page,
          score: value.score,
          reasons: [...value.reasons],
          snippet: value.snippet,
        };
      })
      .filter((value): value is DocumentSearchHit => value !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, payload.limit);

    if (!hits.length) {
      return { ok: true, message: "No matches found.", data: [] };
    }

    return {
      ok: true,
      message: `Found ${hits.length} matching document(s).`,
      data: hits,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Search failed.",
      data: [],
    };
  }
}

export async function getDocumentTagsForAction(documentId: string) {
  return getDocumentTagNames(documentId);
}
