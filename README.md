# Local Document Research (Scaffold)

This repository contains a local-first scaffold for:

- PDF ingestion and text extraction in browser (PDF.js)
- Semantic indexing and retrieval (Ollama + Chroma)
- Local app metadata (SQLite + Drizzle ORM)
- Notes and highlights
- Next.js Server Functions as the boundary for backend communication

## Stack

- Next.js (App Router) + React
- shadcn-style component patterns with Radix primitives
- PDF.js (`pdfjs-dist`)
- Ollama (`embeddinggemma:latest`)
- ChromaDB (`chromadb` client)
- SQLite + Drizzle ORM (`better-sqlite3`, `drizzle-orm`)

## Local Services

Run these services locally before testing semantic indexing/search:

1. Ollama at `http://127.0.0.1:11434`
2. Chroma at `http://127.0.0.1:8000` (via Docker Compose)

Start Chroma:

```bash
docker compose -f compose.yml up -d
```

Stop Chroma:

```bash
docker compose -f compose.yml down
```

## Environment

Copy `.env.example` to `.env.local` and adjust if needed:

```bash
cp .env.example .env.local
```

Key variables:
- `OLLAMA_BASE_URL`
- `OLLAMA_EMBEDDING_MODEL`
- `CHROMA_BASE_URL`
- `CHROMA_COLLECTION`
- `SQLITE_PATH`

## Install and run

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:4000](http://localhost:4000).

## Database

The app auto-bootstraps SQLite schema at runtime (`lib/server/db/bootstrap.ts`).

Optional Drizzle commands:

```bash
pnpm db:generate
pnpm db:push
```

## Important note

This is a scaffold/skeleton:
- Search indexes chunks and returns matches.
- Notes/highlights persist to SQLite.
- Reader tab is a placeholder for full page rendering + text selection mapping.
- The UI is intentionally lean so feature work can layer on top.
