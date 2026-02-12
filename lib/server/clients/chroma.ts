import "server-only";

import { ChromaClient, Collection, type EmbeddingFunction } from "chromadb";

const chromaPath = process.env.CHROMA_BASE_URL ?? "http://127.0.0.1:8000";
const collectionName = process.env.CHROMA_COLLECTION ?? "document_chunks";

const chromaClient = new ChromaClient({ path: chromaPath });
let collectionPromise: Promise<Collection> | null = null;

const manualEmbeddingFunction: EmbeddingFunction = {
  // We always provide embeddings explicitly from Ollama in upsert/query.
  async generate() {
    throw new Error(
      "Manual embedding function was invoked unexpectedly. Provide embeddings explicitly.",
    );
  },
};

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = chromaClient.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: manualEmbeddingFunction,
      metadata: {
        app: "next-document-research",
        embeddingModel:
          process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:latest",
      },
    });
  }

  return collectionPromise;
}

export async function assertChromaAvailable() {
  const heartbeatPaths = ["/api/v2/heartbeat", "/api/v1/heartbeat"];

  for (const heartbeatPath of heartbeatPaths) {
    try {
      const response = await fetch(`${chromaPath}${heartbeatPath}`, {
        method: "GET",
        cache: "no-store",
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Try next known heartbeat path.
    }
  }

  throw new Error(
    `Chroma is not reachable at ${chromaPath}. Start Chroma locally and ensure CHROMA_BASE_URL is correct.`,
  );
}

export async function upsertEmbeddings(input: {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: Record<string, string | number>[];
}) {
  try {
    const collection = await getCollection();
    await collection.upsert(input);
  } catch (error) {
    throw new Error(
      `Failed to upsert embeddings into Chroma at ${chromaPath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

export async function queryEmbeddings(input: {
  queryEmbedding: number[];
  limit: number;
  documentId?: string;
}) {
  try {
    const collection = await getCollection();
    return collection.query({
      queryEmbeddings: [input.queryEmbedding],
      nResults: input.limit,
      where: input.documentId ? { documentId: input.documentId } : undefined,
      include: ["documents", "metadatas", "distances"],
    });
  } catch (error) {
    throw new Error(
      `Failed to query Chroma at ${chromaPath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}
