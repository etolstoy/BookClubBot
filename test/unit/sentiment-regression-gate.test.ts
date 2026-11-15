import { describe, expect, it } from "vitest";
import baseline from "../fixtures/llm/sentiment-baseline.json";
import dataset from "../fixtures/llm/sentiment-dataset.json";
import { createSentimentRegressionGate } from "../helpers/sentiment-regression-gate.js";
import { JEV_SENTIMENT_MODEL, JEV_SENTIMENT_ENDPOINT, SENTIMENT_INSTRUCTIONS, SENTIMENT_CRITERIA, SENTIMENT_RUBRIC_VERSION } from "../../src/clients/llm/sentiment-rubric.js";
import type { Sentiment } from "../../src/lib/interfaces/index.js";

const cases = dataset.map(entry => ({ ...entry, ideal_answer: { sentiment: entry.ideal_answer.sentiment as Sentiment } }));
const configuration = {
  model: JEV_SENTIMENT_MODEL, rubricVersion: SENTIMENT_RUBRIC_VERSION,
  requestConfiguration: {
    model: JEV_SENTIMENT_MODEL, endpoint: JEV_SENTIMENT_ENDPOINT,
    instructions: SENTIMENT_INSTRUCTIONS, criteria: SENTIMENT_CRITERIA,
  },
};
const knownId = "sentiment-review-1121";

describe("Sentiment regression baseline", () => {
  it("accepts the exact known disagreement without counting it as correct", () => {
    const gate = createSentimentRegressionGate(baseline, cases, configuration);
    expect(gate.score(knownId, "negative")).toEqual({ passed: false, knownDisagreement: true, gatePassed: true });
    // Scores remain 11/12 even though all twelve baseline checks pass.
    const scores = cases.map(entry => gate.score(entry.id, entry.id === knownId ? "negative" : entry.ideal_answer.sentiment));
    expect(scores.filter(score => score.passed)).toHaveLength(11);
    expect(scores.every(score => score.gatePassed)).toBe(true);
  });

  it("accepts an improvement to the human reference", () => {
    expect(createSentimentRegressionGate(baseline, cases, configuration).score(knownId, "neutral"))
      .toEqual({ passed: true, knownDisagreement: false, gatePassed: true });
  });

  it.each(["positive", null] as const)("fails a new prediction or unavailable API result: %s", actual => {
    expect(createSentimentRegressionGate(baseline, cases, configuration).score(knownId, actual).gatePassed).toBe(false);
  });

  it("fails a new mismatch on another case", () => {
    expect(createSentimentRegressionGate(baseline, cases, configuration).score("sentiment-review-1088", "negative").gatePassed).toBe(false);
  });

  it("requires the human label in perfect-accuracy mode", () => {
    const gate = createSentimentRegressionGate(baseline, cases, configuration);
    expect(gate.score(knownId, "negative", true).gatePassed).toBe(false);
    expect(gate.score(knownId, "neutral", true).gatePassed).toBe(true);
  });

  it.each(["model", "rubricVersion", "requestConfiguration"] as const)("rejects stale %s", field => {
    expect(() => createSentimentRegressionGate(baseline, cases, { ...configuration, [field]: "changed" }))
      .toThrow(/does not match/);
  });

  it.each(["text", "reference", "removed"])("rejects a changed reference case: %s", change => {
    const edited = structuredClone(cases);
    const entry = edited.find(entry => entry.id === knownId)!;
    if (change === "text") entry.review_text += " Edited.";
    if (change === "reference") entry.ideal_answer.sentiment = "positive";
    expect(() => createSentimentRegressionGate(baseline, change === "removed" ? edited.filter(e => e.id !== knownId) : edited, configuration))
      .toThrow(/Invalid or stale/);
  });

  it("rejects duplicate exceptions and incorrect exception labels", () => {
    const duplicate = { ...baseline, knownDisagreements: [...baseline.knownDisagreements, baseline.knownDisagreements[0]] };
    expect(() => createSentimentRegressionGate(duplicate, cases, configuration)).toThrow(/Invalid or stale/);
    const notDisagreement = { ...baseline, knownDisagreements: baseline.knownDisagreements.map(e => ({ ...e, actual: e.expected })) };
    expect(() => createSentimentRegressionGate(notDisagreement, cases, configuration)).toThrow(/Invalid or stale/);
  });
});
