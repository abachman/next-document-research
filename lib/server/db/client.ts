import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { ensureSchema } from "./bootstrap";

const sqlitePath =
  process.env.SQLITE_PATH ?? path.join(process.cwd(), "data", "app.db");
const absoluteSqlitePath = path.isAbsolute(sqlitePath)
  ? sqlitePath
  : path.join(process.cwd(), sqlitePath);

fs.mkdirSync(path.dirname(absoluteSqlitePath), { recursive: true });

const sqlite = new Database(absoluteSqlitePath);
ensureSchema(sqlite);

export const db = drizzle(sqlite);
