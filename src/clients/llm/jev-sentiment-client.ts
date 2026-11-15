import { z } from "zod";
import type { Sentiment } from "../../lib/interfaces/index.js";
import {
  JEV_SENTIMENT_ENDPOINT,
  JEV_SENTIMENT_MODEL,
  SENTIMENT_INSTRUCTIONS,
  SENTIMENT_CRITERIA,
} from "./sentiment-rubric.js";

const probability = z.number().min(0).max(1);
const responseSchema = z.object({
  model: z.literal(JEV_SENTIMENT_MODEL),
  answers: z.object({
    sentiment: z.object({
      type: z.literal("choice"),
      choice: z.enum(["positive", "neutral", "negative", "unknown"]),
      confidence: probability,
      probabilities: z.object({
        positive: probability, neutral: probability,
        negative: probability, unknown: probability,
      }).refine((p) => Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) <= 0.025),
    }),
  }),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

/** Native Choice API, pinned to the model and rubric approved in the audit. */
export class JevSentimentClient {
  private metrics = { totalInputTokens: 0, totalOutputTokens: 0 };

  constructor(private readonly apiKey: string) {}

  getMetrics() { return { ...this.metrics }; }
  resetMetrics() { this.metrics = { totalInputTokens: 0, totalOutputTokens: 0 }; }

  async analyzeSentiment(reviewText: string): Promise<Sentiment | null> {
    if (!this.apiKey) {
      console.error("[Jev] Sentiment analysis requires JEV_API_KEY");
      return null;
    }
    const body = JSON.stringify({
      model: JEV_SENTIMENT_MODEL,
      state: `Review text:\n\n${reviewText}`,
      questions: { sentiment: {
        type: "choice", instructions: SENTIMENT_INSTRUCTIONS, criteria: SENTIMENT_CRITERIA,
      } },
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await fetch(JEV_SENTIMENT_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body, redirect: "error", signal: AbortSignal.timeout(15_000),
        });
      } catch {
        if (attempt < 2) { await this.backoff(attempt); continue; }
        console.error("[Jev] Sentiment request failed after three attempts");
        return null;
      }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after")) || 0;
        await response.body?.cancel();
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await this.backoff(attempt, retryAfter); continue;
        }
        // Never log provider response bodies or headers: they may contain secrets.
        console.error(`[Jev] Sentiment request failed: HTTP ${response.status}`);
        return null;
      }
      try {
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) {
          console.error("[Jev] Invalid sentiment response");
          return null;
        }
        const { answers, usage } = parsed.data;
        this.metrics.totalInputTokens += usage.input_tokens;
        this.metrics.totalOutputTokens += usage.output_tokens;
        const answer = answers.sentiment;
        console.log(`[Jev] Sentiment: ${answer.choice}; confidence: ${answer.confidence}`);
        return answer.choice === "unknown" ? null : answer.choice;
      } catch {
        console.error("[Jev] Could not decode sentiment response");
        return null;
      }
    }
    return null;
  }

  private async backoff(attempt: number, retryAfter = 0): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve,
      Math.min(2_000, Math.max(250 * 2 ** attempt, retryAfter * 1_000))));
  }
}
