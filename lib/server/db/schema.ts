import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sourceName: text("source_name").notNull(),
  pageCount: integer("page_count").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  page: integer("page").notNull(),
  quote: text("quote").notNull(),
  content: text("content").notNull(),
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
