import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { documents, notes } from "@/lib/server/db/schema";
import type { WorkspaceSnapshot } from "@/lib/types";

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [documentRows, noteRows] = await Promise.all([
    db.select().from(documents).orderBy(desc(documents.createdAt)),
    db.select().from(notes).orderBy(desc(notes.createdAt)).limit(25),
  ]);

  return {
    documents: documentRows,
    notes: noteRows,
  };
}
