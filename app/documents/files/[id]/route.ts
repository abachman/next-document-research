import fs from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/lib/server/db/client";
import { documents } from "@/lib/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rows = await db
    .select({
      filePath: documents.filePath,
      mimeType: documents.mimeType,
      sourceName: documents.sourceName,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const absolutePath = path.isAbsolute(row.filePath)
    ? row.filePath
    : path.join(process.cwd(), row.filePath);

  try {
    const bytes = await fs.readFile(absolutePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename=\"${row.sourceName}\"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
