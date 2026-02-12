import "server-only";

const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
export const embeddingModel =
  process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma:latest";

type OllamaEmbeddingResponse = {
  embedding: number[];
};

export async function createEmbedding(prompt: string) {
  const response = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      prompt,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embedding request failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as OllamaEmbeddingResponse;
  if (!json.embedding || !Array.isArray(json.embedding)) {
    throw new Error("Ollama returned an invalid embedding payload.");
  }

  return json.embedding;
}
