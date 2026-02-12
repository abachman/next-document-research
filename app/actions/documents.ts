"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createEmbedding } from "@/lib/server/clients/ollama";
import { assertChromaAvailable, queryEmbeddings } from "@/lib/server/clients/chroma";
import { db } from "@/lib/server/db/client";
import { chunks, documents, highlights, notes } from "@/lib/server/db/schema";
import { ingestDocument } from "@/lib/server/indexer";
import type { SearchResult } from "@/lib/types";

export type ActionState<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const ingestSchema = z.object({
  sourceName: z.string().min(1),
  title: z.string().min(1),
  pagesJson: z.string().min(2),
});

const noteSchema = z.object({
  documentId: z.string().min(1),
  page: z.coerce.number().int().positive(),
  quote: z.string().default(""),
  content: z.string().min(1),
});

const highlightSchema = z.object({
  documentId: z.string().min(1),
  page: z.coerce.number().int().positive(),
  color: z.string().min(1),
  text: z.string().default(""),
  rectsJson: z.string().default("[]"),
});

const searchSchema = z.object({
  query: z.string().min(3),
  limit: z.coerce.number().int().positive().max(20).default(8),
  documentId: z.string().optional(),
});

type PageInput = { page: number; text: string };

function parsePages(pagesJson: string) {
  const parsed = JSON.parse(pagesJson) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid pages payload.");
  }
  return parsed as PageInput[];
}

export async function ingestDocumentAction(
  _prevState: ActionState<{ documentId: string; chunkCount: number }>,
  formData: FormData,
): Promise<ActionState<{ documentId: string; chunkCount: number }>> {
  try {
    await assertChromaAvailable();

    const payload = ingestSchema.parse({
      sourceName: formData.get("sourceName"),
      title: formData.get("title"),
      pagesJson: formData.get("pagesJson"),
    });

    const pages = parsePages(payload.pagesJson);
    const documentId = crypto.randomUUID();
    const result = await ingestDocument({
      documentId,
      title: payload.title,
      sourceName: payload.sourceName,
      pages,
    });

    revalidatePath("/");
    return {
      ok: true,
      message: `Ingested ${result.chunkCount} chunks.`,
      data: { documentId, chunkCount: result.chunkCount },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to ingest document.",
    };
  }
}

export async function addNoteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = noteSchema.parse({
      documentId: formData.get("documentId"),
      page: formData.get("page"),
      quote: formData.get("quote"),
      content: formData.get("content"),
    });

    await db.insert(notes).values({
      id: crypto.randomUUID(),
      documentId: payload.documentId,
      page: payload.page,
      quote: payload.quote,
      content: payload.content,
      createdAt: Date.now(),
    });

    revalidatePath("/");
    return { ok: true, message: "Note created." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to create note.",
    };
  }
}

export async function addHighlightAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = highlightSchema.parse({
      documentId: formData.get("documentId"),
      page: formData.get("page"),
      color: formData.get("color"),
      text: formData.get("text"),
      rectsJson: formData.get("rectsJson"),
    });

    await db.insert(highlights).values({
      id: crypto.randomUUID(),
      documentId: payload.documentId,
      page: payload.page,
      color: payload.color,
      text: payload.text,
      rectsJson: payload.rectsJson,
      createdAt: Date.now(),
    });

    revalidatePath("/");
    return { ok: true, message: "Highlight stored." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to store highlight.",
    };
  }
}

export async function semanticSearchAction(
  _prevState: ActionState<SearchResult[]>,
  formData: FormData,
): Promise<ActionState<SearchResult[]>> {
  try {
    await assertChromaAvailable();

    const payload = searchSchema.parse({
      query: formData.get("query"),
      limit: formData.get("limit"),
      documentId: formData.get("documentId") || undefined,
    });

    const queryEmbedding = await createEmbedding(payload.query);
    const results = await queryEmbeddings({
      queryEmbedding,
      limit: payload.limit,
      documentId: payload.documentId,
    });

    const metadatas = results.metadatas?.[0] ?? [];
    const distances = results.distances?.[0] ?? [];
    const chunkIds = metadatas
      .map((item) => item?.chunkId)
      .filter((value): value is string => typeof value === "string");

    if (!chunkIds.length) {
      return { ok: true, message: "No matches found.", data: [] };
    }

    const chunkRows = await db
      .select()
      .from(chunks)
      .where(inArray(chunks.id, chunkIds));

    const docIds = [...new Set(chunkRows.map((chunk) => chunk.documentId))];
    const docRows = docIds.length
      ? await db.select().from(documents).where(inArray(documents.id, docIds))
      : [];
    const docsById = new Map(docRows.map((row) => [row.id, row]));
    const chunksById = new Map(chunkRows.map((row) => [row.id, row]));

    const searchRows: SearchResult[] = chunkIds
      .map((chunkId, index) => {
        const chunk = chunksById.get(chunkId);
        if (!chunk) {
          return null;
        }

        const doc = docsById.get(chunk.documentId);
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          documentTitle: doc?.title ?? "Untitled",
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          snippet: chunk.text.slice(0, 240),
          distance: typeof distances[index] === "number" ? distances[index] : null,
        };
      })
      .filter((value): value is SearchResult => value !== null);

    return {
      ok: true,
      message: `Found ${searchRows.length} result(s).`,
      data: searchRows,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Failed to run semantic search.",
      data: [],
    };
  }
}
