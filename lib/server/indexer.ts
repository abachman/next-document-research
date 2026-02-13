import "server-only";

import { eq, inArray } from "drizzle-orm";

import { buildChunks, type TextPage } from "@/lib/server/chunking";
import { upsertEmbeddings } from "@/lib/server/clients/chroma";
import { createEmbedding, embeddingModel } from "@/lib/server/clients/ollama";
import { db } from "@/lib/server/db/client";
import {
  chunkEmbeddings,
  chunks,
  documents,
  documentTags,
  documentPages,
  documentText,
  noteLinks,
  notes,
  noteTags,
} from "@/lib/server/db/schema";

export async function ingestDocument(input: {
  documentId: string;
  title: string;
  sourceName: string;
  pages: TextPage[];
  descriptionMd: string;
  filePath: string;
  mimeType: string;
  byteSize: number;
  wordCount: number;
  fullText: string;
}) {
  const createdAt = Date.now();
  const textChunks = buildChunks(input.documentId, input.pages);

  await db.insert(documents).values({
    id: input.documentId,
    title: input.title,
    sourceName: input.sourceName,
    pageCount: input.pages.length,
    descriptionMd: input.descriptionMd,
    filePath: input.filePath,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    wordCount: input.wordCount,
    createdAt,
    updatedAt: createdAt,
  });

  await db.insert(documentText).values({
    documentId: input.documentId,
    text: input.fullText,
    createdAt,
  });

  await db.insert(documentPages).values(
    input.pages.map((page) => ({
      documentId: input.documentId,
      page: page.page,
      text: page.text,
      createdAt,
    })),
  );

  if (!textChunks.length) {
    return { chunkCount: 0 };
  }

  await db.insert(chunks).values(
    textChunks.map((chunk) => ({
      id: chunk.chunkId,
      documentId: input.documentId,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      createdAt,
    })),
  );

  const embeddings = await Promise.all(textChunks.map((chunk) => createEmbedding(chunk.text)));

  await upsertEmbeddings({
    ids: textChunks.map((chunk) => chunk.chunkId),
    embeddings,
    documents: textChunks.map((chunk) => chunk.text),
    metadatas: textChunks.map((chunk) => ({
      documentId: input.documentId,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      chunkId: chunk.chunkId,
    })),
  });

  await db.insert(chunkEmbeddings).values(
    textChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      chromaId: chunk.chunkId,
      model: embeddingModel,
      createdAt,
    })),
  );

  return { chunkCount: textChunks.length };
}

export async function removeDocumentArtifacts(documentId: string) {
  const documentChunks = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(eq(chunks.documentId, documentId));

  const ids = documentChunks.map((row) => row.id);
  if (ids.length) {
    await db.delete(chunkEmbeddings).where(inArray(chunkEmbeddings.chunkId, ids));
    await db.delete(chunks).where(inArray(chunks.id, ids));
  }

  await db.delete(documentText).where(eq(documentText.documentId, documentId));
  await db.delete(documentPages).where(eq(documentPages.documentId, documentId));
  await db.delete(noteLinks).where(eq(noteLinks.linkedDocumentId, documentId));

  const documentNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.documentId, documentId));
  const noteIds = documentNotes.map((row) => row.id);
  if (noteIds.length) {
    await db.delete(noteTags).where(inArray(noteTags.noteId, noteIds));
    await db.delete(noteLinks).where(inArray(noteLinks.noteId, noteIds));
    await db.delete(notes).where(inArray(notes.id, noteIds));
  }

  await db.delete(documentTags).where(eq(documentTags.documentId, documentId));
  await db.delete(documents).where(eq(documents.id, documentId));
}
