import { createHash } from "node:crypto";
import { z } from "zod";
import type { Sentiment } from "../../src/lib/interfaces/index.js";

const label = z.enum(["positive", "neutral", "negative"]);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const baselineSchema = z.object({
  model: z.string().min(1),
  rubricVersion: z.string().min(1),
  configurationSha256: sha256,
  knownDisagreements: z.array(z.object({
    id: z.string().min(1), expected: label, actual: label,
    reviewSha256: sha256, reason: z.string().min(1),
  })),
});

interface ReferenceCase {
  id: string;
  review_text: string;
  ideal_answer: { sentiment: Sentiment };
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Accept only a reviewed, exact prediction for the same model, rubric and text. */
export function createSentimentRegressionGate(
  baselineInput: unknown,
  cases: ReferenceCase[],
  configuration: { model: string; rubricVersion: string; requestConfiguration: unknown },
) {
  const baseline = baselineSchema.parse(baselineInput);
  if (baseline.model !== configuration.model || baseline.rubricVersion !== configuration.rubricVersion ||
      baseline.configurationSha256 !== digest(JSON.stringify(configuration.requestConfiguration))) {
    throw new Error("Sentiment baseline does not match the current model/rubric/configuration; review it explicitly");
  }
  const references = new Map(cases.map(entry => [entry.id, entry]));
  const known = new Map<string, typeof baseline.knownDisagreements[number]>();
  for (const entry of baseline.knownDisagreements) {
    const reference = references.get(entry.id);
    if (known.has(entry.id) || !reference ||
        reference.ideal_answer.sentiment !== entry.expected ||
        digest(reference.review_text) !== entry.reviewSha256 || entry.actual === entry.expected) {
      throw new Error(`Invalid or stale sentiment baseline case: ${entry.id}`);
    }
    known.set(entry.id, entry);
  }
  return {
    score(id: string, actual: Sentiment | null, requirePerfect = false) {
      const reference = references.get(id);
      if (!reference) throw new Error(`Unknown sentiment reference case: ${id}`);
      const passed = actual === reference.ideal_answer.sentiment;
      // null (abstention, API error or unfinished case) is never an accepted mismatch.
      const knownDisagreement = !passed && actual !== null && known.get(id)?.actual === actual;
      return { passed, knownDisagreement, gatePassed: passed || (!requirePerfect && knownDisagreement) };
    },
  };
}
