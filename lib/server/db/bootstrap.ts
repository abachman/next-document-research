import "server-only";

let bootstrapped = false;

type SqliteExec = {
  exec: (sql: string) => unknown;
};

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
  `);

  bootstrapped = true;
}
