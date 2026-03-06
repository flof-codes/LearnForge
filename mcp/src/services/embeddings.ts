// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @xenova/transformers has no exported Pipeline type
let pipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    const { pipeline: createPipeline } = await import("@xenova/transformers");
    pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    return pipeline;
  })();

  return pipelinePromise;
}

export async function computeEmbedding(text: string): Promise<number[] | null> {
  try {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (err) {
    // Embedding computation not available (e.g. missing sharp/pgvector)
    // Return null — cards still work, just no similarity search
    console.error(`[embeddings] Skipping embedding: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
