import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sourceName: text("source_name").notNull(),
  pageCount: integer("page_count").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  byteSize: integer("byte_size").notNull(),
  wordCount: integer("word_count").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  page: integer("page").notNull(),
  quote: text("quote").notNull(),
  content: text("content").notNull().default(""),
  contentMd: text("content_md").notNull().default(""),
  selectionRectsJson: text("selection_rects_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
});

export const highlights = sqliteTable("highlights", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  page: integer("page").notNull(),
  color: text("color").notNull(),
  text: text("text").notNull(),
  rectsJson: text("rects_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const chunks = sqliteTable("chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const chunkEmbeddings = sqliteTable("chunk_embeddings", {
  chunkId: text("chunk_id").primaryKey(),
  chromaId: text("chroma_id").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const documentTags = sqliteTable("document_tags", {
  documentId: text("document_id").notNull(),
  tagId: text("tag_id").notNull(),
});

export const noteTags = sqliteTable("note_tags", {
  noteId: text("note_id").notNull(),
  tagId: text("tag_id").notNull(),
});

export const noteLinks = sqliteTable("note_links", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull(),
  linkedDocumentId: text("linked_document_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const documentText = sqliteTable("document_text", {
  documentId: text("document_id").primaryKey(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const documentPages = sqliteTable("document_pages", {
  documentId: text("document_id").notNull(),
  page: integer("page").notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});
