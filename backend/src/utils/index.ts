import { pipeline } from '@huggingface/transformers';

let embeddingPipeline: any = null;

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    // Initialize the pipeline with a lightweight model suitable for embeddings
    embeddingPipeline = await pipeline(
        'feature-extraction',
        'mixedbread-ai/mxbai-embed-large-v1',
        {
            // @ts-ignore
            quantized: true,
            device: process.env.EMBEDDING_DEVICE as any,
            dtype: process.env.EMBEDDING_TYPE as any,
        }
    );
  }

  // Generate embeddings
  const result = await embeddingPipeline(text, {
    pooling: 'cls',
    normalize: true,
  });

  // Convert to regular array and return
  return Array.from(result.data);
}

export function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
