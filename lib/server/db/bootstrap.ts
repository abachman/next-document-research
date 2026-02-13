import "server-only";

let bootstrapped = false;

type SqliteExec = {
  exec: (sql: string) => unknown;
};

function tryAddColumn(sqlite: SqliteExec, table: string, columnSql: string) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql};`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column")) {
      throw error;
    }
  }
}

export function ensureSchema(sqlite: SqliteExec) {
  if (bootstrapped) {
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      quote TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      color TEXT NOT NULL,
      text TEXT NOT NULL,
      rects_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id TEXT PRIMARY KEY NOT NULL,
      chroma_id TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (document_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      linked_document_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_text (
      document_id TEXT PRIMARY KEY NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_pages (
      document_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, page)
    );
  `);

  tryAddColumn(sqlite, "documents", "description_md TEXT NOT NULL DEFAULT ''");
  tryAddColumn(sqlite, "documents", "file_path TEXT NOT NULL DEFAULT ''");
  tryAddColumn(sqlite, "documents", "mime_type TEXT NOT NULL DEFAULT 'application/pdf'");
  tryAddColumn(sqlite, "documents", "byte_size INTEGER NOT NULL DEFAULT 0");
  tryAddColumn(sqlite, "documents", "word_count INTEGER NOT NULL DEFAULT 0");
  tryAddColumn(sqlite, "documents", "updated_at INTEGER NOT NULL DEFAULT 0");

  tryAddColumn(sqlite, "notes", "content_md TEXT NOT NULL DEFAULT ''");
  tryAddColumn(sqlite, "notes", "selection_rects_json TEXT NOT NULL DEFAULT '[]'");

  sqlite.exec(`
    UPDATE notes
    SET content_md = content
    WHERE (content_md IS NULL OR content_md = '') AND content IS NOT NULL;

    UPDATE notes
    SET selection_rects_json = '[]'
    WHERE selection_rects_json IS NULL OR selection_rects_json = '';

    UPDATE documents
    SET updated_at = created_at
    WHERE updated_at IS NULL OR updated_at = 0;

    CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes(document_id);
    CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
    CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
    CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_links_note_id ON note_links(note_id);
  `);

  bootstrapped = true;
}
