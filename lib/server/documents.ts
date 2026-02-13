import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import {
  documentTags,
  documents,
  noteLinks,
  notes,
  noteTags,
  tags,
} from "@/lib/server/db/schema";
import type {
  DocumentDetailSnapshot,
  DocumentListItem,
  DocumentsPageSnapshot,
  NoteDetail,
  TagRow,
} from "@/lib/types";

export function normalizeTagName(input: string) {
  return input.trim().toLowerCase();
}

export function parseTagList(value: string) {
  return [...new Set(value.split(",").map((part) => normalizeTagName(part)).filter(Boolean))];
}

export async function getDocumentsPageSnapshot(): Promise<DocumentsPageSnapshot> {
  const [documentRows, documentTagRows, allTagRows] = await Promise.all([
    db.select().from(documents).orderBy(desc(documents.createdAt)),
    db
      .select({ documentId: documentTags.documentId, tagName: tags.name })
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId)),
    db.select().from(tags).orderBy(tags.name),
  ]);

  const tagsByDocument = new Map<string, string[]>();
  for (const row of documentTagRows) {
    const values = tagsByDocument.get(row.documentId) ?? [];
    values.push(row.tagName);
    tagsByDocument.set(row.documentId, values);
  }

  const list: DocumentListItem[] = documentRows.map((row) => ({
    id: row.id,
    title: row.title,
    byteSize: row.byteSize,
    pageCount: row.pageCount,
    wordCount: row.wordCount,
    descriptionMd: row.descriptionMd,
    createdAt: row.createdAt,
    tags: (tagsByDocument.get(row.id) ?? []).sort(),
  }));

  return {
    documents: list,
    tags: allTagRows.map((row) => row.name),
  };
}

export async function getDocumentDetailSnapshot(
  documentId: string,
): Promise<DocumentDetailSnapshot | null> {
  const documentRows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  const document = documentRows[0];
  if (!document) {
    return null;
  }

  const [documentTagRows, noteRows, allDocuments, allTagRows] = await Promise.all([
    db
      .select({ tagName: tags.name })
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId))
      .where(eq(documentTags.documentId, documentId)),
    db.select().from(notes).where(eq(notes.documentId, documentId)).orderBy(desc(notes.createdAt)),
    db.select({ id: documents.id, title: documents.title }).from(documents).orderBy(documents.title),
    db.select().from(tags).orderBy(tags.name),
  ]);

  const noteIds = noteRows.map((row) => row.id);
  const [noteTagRows, noteLinkRows] = await Promise.all([
    noteIds.length
      ? db
          .select({ noteId: noteTags.noteId, tagName: tags.name })
          .from(noteTags)
          .innerJoin(tags, eq(tags.id, noteTags.tagId))
          .where(inArray(noteTags.noteId, noteIds))
      : Promise.resolve([]),
    noteIds.length
      ? db.select().from(noteLinks).where(inArray(noteLinks.noteId, noteIds))
      : Promise.resolve([]),
  ]);

  const linkedDocumentIds = [...new Set(noteLinkRows.map((row) => row.linkedDocumentId))];
  const linkedDocuments = linkedDocumentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(inArray(documents.id, linkedDocumentIds))
    : [];

  const linkedById = new Map(linkedDocuments.map((row) => [row.id, row]));

  const noteTagsByNote = new Map<string, string[]>();
  for (const row of noteTagRows) {
    const values = noteTagsByNote.get(row.noteId) ?? [];
    values.push(row.tagName);
    noteTagsByNote.set(row.noteId, values);
  }

  const noteLinksByNote = new Map<string, Array<{ id: string; title: string }>>();
  for (const row of noteLinkRows) {
    const linkedDoc = linkedById.get(row.linkedDocumentId);
    if (!linkedDoc) {
      continue;
    }
    const values = noteLinksByNote.get(row.noteId) ?? [];
    values.push(linkedDoc);
    noteLinksByNote.set(row.noteId, values);
  }

  const noteDetails: NoteDetail[] = noteRows.map((row) => ({
    id: row.id,
    documentId: row.documentId,
    page: row.page,
    quote: row.quote,
    contentMd: row.contentMd,
    tags: (noteTagsByNote.get(row.id) ?? []).sort(),
    linkedDocuments: noteLinksByNote.get(row.id) ?? [],
    createdAt: row.createdAt,
  }));

  return {
    document,
    tags: documentTagRows.map((row) => row.tagName).sort(),
    allTags: allTagRows.map((row) => row.name),
    notes: noteDetails,
    allDocuments,
  };
}

export async function upsertTagsByName(names: string[]) {
  const normalized = [...new Set(names.map((name) => normalizeTagName(name)).filter(Boolean))];
  if (!normalized.length) {
    return [] as TagRow[];
  }

  const existingRows = await db.select().from(tags);
  const existingByName = new Map(existingRows.map((row) => [normalizeTagName(row.name), row]));

  const missing = normalized.filter((name) => !existingByName.has(name));
  if (missing.length) {
    const createdAt = Date.now();
    await db.insert(tags).values(
      missing.map((name) => ({
        id: crypto.randomUUID(),
        name,
        createdAt,
      })),
    );
  }

  const allRows = await db.select().from(tags).where(inArray(tags.name, normalized));
  return allRows;
}

export async function setDocumentTags(documentId: string, tagNames: string[]) {
  await db.delete(documentTags).where(eq(documentTags.documentId, documentId));

  const tagRows = await upsertTagsByName(tagNames);
  if (!tagRows.length) {
    return;
  }

  await db.insert(documentTags).values(
    tagRows.map((tag) => ({
      documentId,
      tagId: tag.id,
    })),
  );
}

export async function setNoteTags(noteId: string, tagNames: string[]) {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));

  const tagRows = await upsertTagsByName(tagNames);
  if (!tagRows.length) {
    return;
  }

  await db.insert(noteTags).values(
    tagRows.map((tag) => ({
      noteId,
      tagId: tag.id,
    })),
  );
}

export async function setNoteLinks(noteId: string, linkedDocumentIds: string[]) {
  await db.delete(noteLinks).where(eq(noteLinks.noteId, noteId));

  const uniqueIds = [...new Set(linkedDocumentIds.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return;
  }

  const existingRows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(inArray(documents.id, uniqueIds));
  const validIds = new Set(existingRows.map((row) => row.id));

  const createdAt = Date.now();
  const values = uniqueIds
    .filter((id) => validIds.has(id))
    .map((linkedDocumentId) => ({
      id: crypto.randomUUID(),
      noteId,
      linkedDocumentId,
      createdAt,
    }));

  if (values.length) {
    await db.insert(noteLinks).values(values);
  }
}

export async function getDocumentTagNames(documentId: string) {
  const rows = await db
    .select({ tagName: tags.name })
    .from(documentTags)
    .innerJoin(tags, eq(tags.id, documentTags.tagId))
    .where(eq(documentTags.documentId, documentId));

  return rows.map((row) => row.tagName).sort();
}

export async function filterDocumentsByTagNames(tagNames: string[]) {
  const normalized = [...new Set(tagNames.map((value) => normalizeTagName(value)).filter(Boolean))];
  if (!normalized.length) {
    return null;
  }

  const tagRows = await db.select().from(tags).where(inArray(tags.name, normalized));
  if (tagRows.length !== normalized.length) {
    return [];
  }

  const tagIds = tagRows.map((row) => row.id);
  const relationRows = await db
    .select({ documentId: documentTags.documentId, tagId: documentTags.tagId })
    .from(documentTags)
    .where(inArray(documentTags.tagId, tagIds));

  const counts = new Map<string, number>();
  for (const row of relationRows) {
    counts.set(row.documentId, (counts.get(row.documentId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= tagIds.length)
    .map(([documentId]) => documentId);
}
