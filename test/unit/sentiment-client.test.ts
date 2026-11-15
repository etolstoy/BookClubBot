import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CascadingOpenAIClient } from "../../src/clients/llm/cascading-openai-client.js";
import { JEV_SENTIMENT_MODEL, JEV_SENTIMENT_ENDPOINT, SENTIMENT_CRITERIA, SENTIMENT_INSTRUCTIONS } from "../../src/clients/llm/sentiment-rubric.js";

const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: createResponse }; } }));
const fetchMock = vi.fn();
function payload(choice = "positive") {
  return { model: JEV_SENTIMENT_MODEL, answers: { sentiment: {
    type: "choice", choice, confidence: 1,
    probabilities: Object.fromEntries(["positive", "neutral", "negative", "unknown"].map(l => [l, l === choice ? 1 : 0])),
  } }, usage: { input_tokens: 123, output_tokens: 46 } };
}
function client() { return new CascadingOpenAIClient({ apiKey: "test_openai_key", jevApiKey: "test_jev_key" }); }

describe("Production Jev sentiment pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createResponse.mockReset(); fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(["positive", "neutral", "negative", "unknown"])("maps %s without using OpenAI", async choice => {
    fetchMock.mockResolvedValue(Response.json(payload(choice)));
    const c = client();
    expect(await c.analyzeSentiment("The complete review.")).toBe(choice === "unknown" ? null : choice);
    expect(createResponse).not.toHaveBeenCalled();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(JEV_SENTIMENT_ENDPOINT);
    expect(request.redirect).toBe("error");
    expect(request.headers.Authorization).toBe("Bearer test_jev_key");
    expect(JSON.parse(request.body)).toEqual({ model: JEV_SENTIMENT_MODEL,
      state: "Review text:\n\nThe complete review.", questions: { sentiment: {
        type: "choice", instructions: SENTIMENT_INSTRUCTIONS, criteria: SENTIMENT_CRITERIA,
      } } });
    expect(c.getMetrics()).toEqual({ webSearchFallbacks: 0, totalInputTokens: 123, totalOutputTokens: 46 });
    c.resetMetrics(); expect(c.getMetrics().totalInputTokens).toBe(0);
  });

  it.each([429, 503])("retries transient HTTP %s and then succeeds", async status => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(Response.json(payload()));
    const result = client().analyzeSentiment("Wonderful.");
    await vi.runAllTimersAsync();
    expect(await result).toBe("positive");expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds network retries and returns unknown on failure", async () => {
    fetchMock.mockRejectedValue(new Error("secret provider message"));
    const result = client().analyzeSentiment("Review.");await vi.runAllTimersAsync();
    expect(await result).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret provider message");
  });

  it("does not retry authentication failures or log provider secrets", async () => {
    fetchMock.mockResolvedValue(new Response("test_jev_key", {status:401}));
    expect(await client().analyzeSentiment("Review.")).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test_jev_key");
  });

  it.each(["missing probabilities", "wrong model", "invalid choice", "non-json"])("rejects %s", async kind => {
    const p=payload();
    if(kind === "missing probabilities") delete (p.answers.sentiment as any).probabilities;
    if(kind === "wrong model") (p as any).model="another-model";
    if(kind === "invalid choice") p.answers.sentiment.choice="great";
    fetchMock.mockResolvedValue(kind === "non-json" ? new Response("invalid") : Response.json(p));
    const c=client(); expect(await c.analyzeSentiment("Review.")).toBeNull();expect(c.getMetrics().totalInputTokens).toBe(0);
  });
});
