/**
 * The Gateway embedding adapter (decision #43): `embedMany` from `ai` with
 * the package's model id, through the Vercel AI Gateway and
 * `AI_GATEWAY_API_KEY`. Any failure throws, which a search turns into a
 * keyword-only, degraded result.
 */
import { embedMany } from "ai";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type Embed,
} from "./lib/embeddings";

export const gatewayEmbed: Embed = async (texts) => {
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return embeddings;
};
