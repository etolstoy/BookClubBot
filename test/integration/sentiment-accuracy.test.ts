/**
 * Live sentiment evaluation against human-approved production reviews.
 * Run with npm run test:sentiment-accuracy; ordinary test runs make no API calls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import dataset from "../fixtures/llm/sentiment-dataset.json";
import adjudicationDataset from "../fixtures/llm/sentiment-adjudication-dataset.json";
import baseline from "../fixtures/llm/sentiment-baseline.json";
import { CascadingOpenAIClient, SENTIMENT_RUBRIC_VERSION } from "../../src/clients/llm/cascading-openai-client.js";
import { JEV_SENTIMENT_MODEL, JEV_SENTIMENT_ENDPOINT, SENTIMENT_INSTRUCTIONS, SENTIMENT_CRITERIA } from "../../src/clients/llm/sentiment-rubric.js";
import type { Sentiment } from "../../src/lib/interfaces/index.js";
import { createSentimentRegressionGate } from "../helpers/sentiment-regression-gate.js";

const sentimentSchema = z.enum(["positive", "neutral", "negative"]);
const datasetSchema = z.array(z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  review_text: z.string().min(1),
  ideal_answer: z.object({ sentiment: sentimentSchema }),
  source: z.object({
    type: z.enum(["human_correction", "random_control"]),
    review_id: z.number().int().positive(),
  }).passthrough(),
})).nonempty().refine(
  (cases) => new Set(cases.map((entry) => entry.id)).size === cases.length,
  "Sentiment case IDs must be unique"
);
const entries = datasetSchema.parse(dataset);
const deferred = datasetSchema.parse(adjudicationDataset);
const allIds = [...entries, ...deferred].map((entry) => entry.id);
if (new Set(allIds).size !== allIds.length) {
  throw new Error("Strict and adjudication sentiment cases must not overlap");
}

const filter = process.env.SENTIMENT_TEST_FILTER;
const selected = filter ? entries.filter((entry) => entry.id === filter) : entries;
if (selected.length === 0) {
  if (deferred.some((entry) => entry.id === filter)) {
    throw new Error(`${filter} awaits adjudication and is excluded from strict scoring`);
  }
  throw new Error(`No sentiment test case matches SENTIMENT_TEST_FILTER=${filter}`);
}

const labels: Sentiment[] = ["positive", "neutral", "negative"];
const shouldRunLiveAccuracy = process.env.RUN_SENTIMENT_ACCURACY === "1";
const requirePerfect = process.env.SENTIMENT_REQUIRE_PERFECT === "1";
const gate = createSentimentRegressionGate(baseline, entries, {
  model: JEV_SENTIMENT_MODEL,
  rubricVersion: SENTIMENT_RUBRIC_VERSION,
  requestConfiguration: {
    model: JEV_SENTIMENT_MODEL, endpoint: JEV_SENTIMENT_ENDPOINT,
    instructions: SENTIMENT_INSTRUCTIONS, criteria: SENTIMENT_CRITERIA,
  },
});

interface CaseResult {
  id: string;
  description: string;
  source: "human_correction" | "random_control";
  expected: Sentiment;
  actual: Sentiment | null;
  passed: boolean;
  knownDisagreement: boolean;
  gatePassed: boolean;
  elapsedMs: number;
}

describe.skipIf(!shouldRunLiveAccuracy)("Sentiment accuracy (production LLM client)", () => {
  let client: CascadingOpenAIClient | undefined;
  const results = new Map<string, CaseResult>();

  beforeAll(() => {
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey || /^(test_|your_|placeholder)/i.test(apiKey)) {
      throw new Error(
        "Live sentiment evaluation requires a real JEV_API_KEY. " +
        "Set it in .env or the environment, then run npm run test:sentiment-accuracy."
      );
    }
    client = new CascadingOpenAIClient({ apiKey: "unused_for_sentiment", jevApiKey: apiKey });
  });

  afterAll(() => {
    if (!client) return;
    // A timed-out or otherwise unfinished case is a failure, not an omitted row.
    const ordered: CaseResult[] = selected.map((entry) => results.get(entry.id) ?? {
      id: entry.id,
      description: entry.description,
      source: entry.source.type,
      expected: entry.ideal_answer.sentiment,
      actual: null,
      passed: false,
      knownDisagreement: false,
      gatePassed: false,
      elapsedMs: 90_000,
    });
    const passed = ordered.filter((result) => result.passed).length;
    const byLabel = Object.fromEntries(labels.map((label) => {
      const cases = ordered.filter((result) => result.expected === label);
      const correct = cases.filter((result) => result.passed).length;
      return [label, {
        total: cases.length,
        correct,
        accuracy: cases.length ? correct / cases.length : null,
      }];
    }));
    const confusionMatrix = Object.fromEntries(labels.map((expected) => [
      expected,
      Object.fromEntries([...labels, "null"].map((actual) => [
        actual,
        ordered.filter((result) =>
          result.expected === expected && (result.actual ?? "null") === actual
        ).length,
      ])),
    ]));
    const report = {
      evaluatedAt: new Date().toISOString(),
      provider: "jev",
      model: JEV_SENTIMENT_MODEL,
      rubricVersion: SENTIMENT_RUBRIC_VERSION,
      candidateCount: entries.length + deferred.length,
      deferredCount: deferred.length,
      deferredCases: adjudicationDataset.map((entry) => ({
        id: entry.id,
        description: entry.description,
        originalLabel: entry.ideal_answer.sentiment,
        ...entry.adjudication,
      })),
      total: ordered.length,
      passed,
      accuracy: ordered.length ? passed / ordered.length : 0,
      regressionGate: {
        mode: requirePerfect ? "perfect-accuracy" : "accepted-baseline",
        passed: ordered.every(result => result.gatePassed),
        knownDisagreements: ordered.filter(result => result.knownDisagreement).map(result => result.id),
        failedCases: ordered.filter(result => !result.gatePassed).map(result => result.id),
      },
      byLabel,
      confusionMatrix,
      usage: client.getMetrics(),
      results: ordered,
    };
    const reportPath = resolve(
      process.env.SENTIMENT_REPORT_PATH || "reports/sentiment-accuracy/latest.json"
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

    console.log(`\nSENTIMENT ACCURACY: ${passed}/${ordered.length} ` +
      `(${(report.accuracy * 100).toFixed(1)}%)`);
    console.log(`Rubric ${SENTIMENT_RUBRIC_VERSION}; ${deferred.length} candidates ` +
      "await adjudication and do not count as passes.");
    console.log(`Regression gate (${report.regressionGate.mode}): ` +
      `${report.regressionGate.passed ? "PASS" : "FAIL"}; ` +
      `${report.regressionGate.knownDisagreements.length} known disagreements still count as incorrect.`);
    console.table(byLabel);
    console.log("Confusion matrix (expected rows, predicted columns):");
    console.table(confusionMatrix);
    for (const result of ordered.filter((entry) => !entry.passed)) {
      console.log(`${result.id} (${result.description}): ` +
        `expected ${result.expected}, got ${result.actual}` +
        (result.knownDisagreement ? " [known baseline disagreement]" : " [NEW FAILURE]"));
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### Sentiment evaluation\n\n` +
        `Reference accuracy: **${passed}/${ordered.length}** (${(report.accuracy * 100).toFixed(1)}%). ` +
        `Gate (${report.regressionGate.mode}): **${report.regressionGate.passed ? "PASS" : "FAIL"}**.\n\n` +
        `Known disagreements remain incorrect in the accuracy score. ` +
        `${deferred.length} deferred cases are excluded.\n\n` +
        `| Case | Human reference | Prediction | Status |\n| --- | --- | --- | --- |\n` +
        ordered.filter(result => !result.passed).map(result =>
          `| ${result.id} | ${result.expected} | ${result.actual ?? "null"} | ` +
          `${result.knownDisagreement ? "Known disagreement" : "New failure"} |\n`
        ).join(""));
    }
    console.log(`Report: ${reportPath}\n`);
  });

  it.concurrent.each(selected)("$id: $description", async (entry) => {
    const started = Date.now();
    const actual = await client!.analyzeSentiment(entry.review_text);
    const expected = entry.ideal_answer.sentiment;
    const score = gate.score(entry.id, actual, requirePerfect);
    results.set(entry.id, {
      id: entry.id,
      description: entry.description,
      source: entry.source.type,
      expected,
      actual,
      ...score,
      elapsedMs: Date.now() - started,
    });
    expect(score.gatePassed,
      `${entry.id}: ${entry.description}: human reference ${expected}, got ${actual}; ` +
      (requirePerfect ? "perfect accuracy required" : "prediction must match the reference or its exact accepted baseline")
    ).toBe(true);
  }, 90_000);
});
