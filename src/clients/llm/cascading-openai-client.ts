/**
 * Cascading OpenAI Client Implementation
 * Uses nano model for title/author extraction, escalates to web search for author when needed
 * Uses Responses API with Structured Outputs
 */

import OpenAI from "openai";
import type {
  ILLMClient,
  LLMClientConfig,
  ExtractedBookInfo,
  Sentiment,
  LLMCompletionOptions,
  LLMConfidence,
} from "../../lib/interfaces/index.js";

// ============================================================================
// PROMPTS - Edit these to tune extraction behavior
// ============================================================================

const TITLE_EXTRACTION_PROMPT = `Extract the primary book title from this review.

Rules:
- Identify the main book being reviewed
- Use canonical ENGLISH title for non-Russian works
- Use the original published title in its original script for Russian-original works, even if it's English
- "high": title explicitly mentioned with quotes or clear attribution
- "medium": title clearly identifiable from context
- "low": title uncertain or multiple candidates`;

const getAuthorExtractionPrompt = (title: string) => `Given the book title "${title}", extract the author from this review.

Hard rules:
- Never invent or guess a given name from a surname-only mention.
- You may output a full "GivenName Surname" ONLY if:
  (A) the review text contains both given name and surname, OR
  (B) the title uniquely identifies the author (a single widely accepted author), and nothing in the review contradicts it.
- If neither (A) nor (B) holds, author=null.
- If there are multiple authors, separate them by comma (e.g., "GivenName Surname, GivenName Surname").

Normalization:
- Detect both "GivenName Surname" and "Surname GivenName" patterns; normalize to "GivenName Surname".
- Determine whether each author is Russian or non-Russian.
- If the author is Russian: output the author name in Cyrillic.
- If the author is non-Russian: output the author name in Latin script (diacritics allowed).
- DO NOT transliterate non-Russian author names into Cyrillic, even if the title/review snippet is in Russian.
- Use "GivenName Surname" format only: no patronymics, no initials – full first name.
- If (B) holds (unique title→author mapping), use the canonical author spelling from that mapping for the Latin-script output.
  - Treat Cyrillic spellings/transliterations as evidence of identity, not authoritative for exact Latin given-name spelling.
  - If the review contains a Cyrillic transliteration/variant consistent with the title-mapped author (same surname, plausible phonetic match),
    output the canonical Latin name from the title mapping.

isspellings:
- Fix misspellings only when you can still confidently identify the same author:
  - OK to fix when (B) holds, or when (A) holds and the fix is a minor orthographic correction.
  - Do NOT “correct” into a different person or a different plausible name variant unless (B) resolves it unambiguously.

Confidence:
- "high": full given name + surname are explicitly present in the review text in Latin script (or already in the exact canonical form you will output).
- "medium": author is not fully explicit in the review (e.g., surname-only), or the review uses transliteration/variant spellings, but you can resolve the full canonical name via an unambiguous title→author mapping; or if there are potential misspellings and you correct them safely.
- "low": author uncertain / ambiguous / conflicting signals / not found.`

const getWebSearchAuthorPrompt = (title: string, reviewContext: string) => `Find the author(s) of the book "${title}".

You are allowed to use web search in this fallback step.

Context from review (may be partial / truncated): ${reviewContext}

Hard rules:
- Never invent or guess a given name from a surname-only mention found in the review snippet.
- Output a full "GivenName Surname" ONLY if:
  (A) the review snippet contains both given name and surname for that author, OR
  (B) web search confirms the title uniquely identifies the author(s) (single widely accepted work/edition), and nothing in the review snippet contradicts it.
- If the title is ambiguous (multiple different books share the same title) and the review snippet does not disambiguate, return null.
- If there are multiple authors, separate by comma (e.g., "GivenName Surname, GivenName Surname").

Normalization:
- Determine whether each author is Russian or non-Russian.
- If the author is Russian: output the author name in Cyrillic.
- If the author is non-Russian: output the author name in Latin script (diacritics allowed).
- DO NOT transliterate non-Russian author names into Cyrillic, even if the title/review snippet is in Russian.
- Use "GivenName Surname" format only: no patronymics, no initials – full first name.

Output:
- Return ONLY the author string (one or more names separated by comma), or null. No extra text.`;

// ============================================================================
// SCHEMAS - JSON Schema definitions for structured outputs
// ============================================================================

const titleExtractionSchema = {
  type: "json_schema" as const,
  name: "title_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "The canonical book title" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["title", "confidence"],
    additionalProperties: false,
  },
};

const authorExtractionSchema = {
  type: "json_schema" as const,
  name: "author_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      author: { type: ["string", "null"], description: "The author name" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["author", "confidence"],
    additionalProperties: false,
  },
};

const sentimentAnalysisSchema = {
  type: "json_schema" as const,
  name: "sentiment_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
    },
    required: ["sentiment"],
    additionalProperties: false,
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineMetrics {
  webSearchFallbacks: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface TitleExtractionResult {
  title: string | null;
  confidence: LLMConfidence;
}

interface AuthorExtractionResult {
  author: string | null;
  confidence: LLMConfidence;
}

// ============================================================================
// CLIENT IMPLEMENTATION
// ============================================================================

export class CascadingOpenAIClient implements ILLMClient {
  private client: OpenAI;
  private config: LLMClientConfig;

  private readonly NANO_MODEL = "gpt-5-nano";
  private readonly WEB_SEARCH_MODEL = "gpt-5.2";

  private metrics: PipelineMetrics = {
    webSearchFallbacks: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };

  constructor(config: LLMClientConfig) {
    this.config = {
      defaultModel: "gpt-5-nano",
      defaultTemperature: 1,
      ...config,
    };
    this.client = new OpenAI({ apiKey: this.config.apiKey });
  }

  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      webSearchFallbacks: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  private trackUsage(response: OpenAI.Responses.Response): void {
    if (response.usage) {
      this.metrics.totalInputTokens += response.usage.input_tokens || 0;
      this.metrics.totalOutputTokens += response.usage.output_tokens || 0;
    }
  }

  /**
   * Extract book information using cascading pipeline:
   * 1. Extract title with nano model
   * 2. Extract author with nano model
   * 3. If author weak, escalate to web search
   */
  async extractBookInfo(
    reviewText: string,
    commandParams?: string
  ): Promise<ExtractedBookInfo | null> {
    const userContent = commandParams
      ? `Extract book information from these command parameters: "${commandParams}"\n\nContext (original review text for reference):\n${reviewText}`
      : reviewText;

    console.log("[Cascading Client] Starting extraction pipeline");

    // Step 1: Extract title with nano model
    const titleResult = await this.extractTitleWithNano(userContent);
    console.log("[Cascading Client] Step 1 (nano title):", JSON.stringify(titleResult));

    if (!titleResult.title || titleResult.confidence === "low") {
      console.log("[Cascading Client] No title or low confidence, returning null");
      return null;
    }

    // Step 2: Extract author with nano model
    console.log("[Cascading Client] Step 2 (nano author)");
    const authorResult = await this.extractAuthorWithNano(userContent, titleResult.title);
    console.log("[Cascading Client] Nano author result:", JSON.stringify(authorResult));

    // Step 3: If author weak, escalate to web search
    if (!authorResult.author || authorResult.confidence === "low" || authorResult.confidence === "medium") {
      console.log("[Cascading Client] Step 3 (web search for author)");
      this.metrics.webSearchFallbacks++;
      const webSearchAuthor = await this.extractAuthorWithWebSearch(titleResult.title, userContent);
      console.log("[Cascading Client] Web search result:", JSON.stringify(webSearchAuthor));

      // Fall back to nano author if web search didn't improve the result
      let finalAuthor = webSearchAuthor.author;
      let finalConfidence = webSearchAuthor.confidence;

      if (!webSearchAuthor.author ||
          (webSearchAuthor.confidence === "low" && authorResult.author && authorResult.confidence === "medium")) {
        console.log("[Cascading Client] Web search failed or returned worse result, falling back to nano author");
        finalAuthor = authorResult.author;
        finalConfidence = authorResult.confidence;
      }

      return {
        title: titleResult.title,
        author: finalAuthor,
        confidence: this.combineConfidence(titleResult.confidence, finalConfidence),
      };
    }

    return {
      title: titleResult.title,
      author: authorResult.author,
      confidence: this.combineConfidence(titleResult.confidence, authorResult.confidence),
    };
  }

  private extractTextFromResponse(response: OpenAI.Responses.Response): string | null {
    const messageItem = response.output.find((item) => item.type === "message");
    if (!messageItem || messageItem.type !== "message") {
      return null;
    }

    const textPart = messageItem.content.find((part) => part.type === "output_text");
    if (!textPart || textPart.type !== "output_text") {
      return null;
    }

    return textPart.text;
  }

  private async extractTitleWithNano(userContent: string): Promise<TitleExtractionResult> {
    try {
      const response = await this.client.responses.create({
        model: this.NANO_MODEL,
        instructions: TITLE_EXTRACTION_PROMPT,
        input: userContent,
        text: { format: titleExtractionSchema },
      });

      this.trackUsage(response);
      const content = this.extractTextFromResponse(response);
      if (!content) {
        return { title: null, confidence: "low" };
      }

      const parsed = JSON.parse(content);
      return {
        title: parsed.title || null,
        confidence: parsed.confidence || "low",
      };
    } catch (error) {
      console.error("[Cascading Client] Error in nano title extraction:", error);
      await this.handleError(error as Error, "Nano Title Extraction");
      return { title: null, confidence: "low" };
    }
  }

  private async extractAuthorWithNano(
    userContent: string,
    title: string
  ): Promise<AuthorExtractionResult> {
    try {
      const response = await this.client.responses.create({
        model: this.NANO_MODEL,
        instructions: getAuthorExtractionPrompt(title),
        input: userContent,
        text: { format: authorExtractionSchema },
      });

      this.trackUsage(response);
      const content = this.extractTextFromResponse(response);
      if (!content) {
        return { author: null, confidence: "low" };
      }

      const parsed = JSON.parse(content);
      return {
        author: parsed.author || null,
        confidence: parsed.confidence || "low",
      };
    } catch (error) {
      console.error("[Cascading Client] Error in nano author extraction:", error);
      await this.handleError(error as Error, "Nano Author Extraction");
      return { author: null, confidence: "low" };
    }
  }

  private async extractAuthorWithWebSearch(
    title: string,
    userContent: string
  ): Promise<AuthorExtractionResult> {
    try {
      const response = await this.client.responses.create({
        model: this.WEB_SEARCH_MODEL,
        input: getWebSearchAuthorPrompt(title, userContent.substring(0, 500)),
        tools: [{ type: "web_search_preview" }],
        text: { format: authorExtractionSchema },
      });

      this.trackUsage(response);
      const content = this.extractTextFromResponse(response);
      if (!content) {
        console.log("[Cascading Client] No text content in web search response");
        return { author: null, confidence: "low" };
      }

      const parsed = JSON.parse(content);
      return {
        author: parsed.author || null,
        confidence: parsed.confidence || "medium",
      };
    } catch (error) {
      console.error("[Cascading Client] Error in web search author extraction:", error);
      await this.handleError(error as Error, "Web Search Author Extraction");
      return { author: null, confidence: "low" };
    }
  }

  private combineConfidence(
    titleConfidence: LLMConfidence,
    authorConfidence: LLMConfidence
  ): LLMConfidence {
    if (titleConfidence === "low" || authorConfidence === "low") {
      return "low";
    }
    if (titleConfidence === "medium" || authorConfidence === "medium") {
      return "medium";
    }
    return "high";
  }

  async analyzeSentiment(reviewText: string): Promise<Sentiment | null> {
    const instructions = `Analyze the following book review and classify the reviewer's sentiment.
Return ONLY one of: "positive", "negative", or "neutral"

Guidelines:
- "positive": The reviewer recommends the book, enjoyed it, or speaks highly of it
- "negative": The reviewer does not recommend the book, disliked it, or criticizes it
- "neutral": Mixed feelings, informational review without clear recommendation, or balanced pros/cons`;

    try {
      const response = await this.client.responses.create({
        model: this.NANO_MODEL,
        instructions: instructions,
        input: `Review text:\n\n${reviewText}`,
        text: { format: sentimentAnalysisSchema },
      });

      this.trackUsage(response);
      const content = this.extractTextFromResponse(response);
      if (!content) {
        console.warn("[Cascading Client] No content in sentiment response");
        return null;
      }

      const parsed = JSON.parse(content);
      const sentiment = parsed.sentiment;

      if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") {
        return sentiment;
      }

      console.warn(`[Cascading Client] Unexpected sentiment value: ${sentiment}`);
      return null;
    } catch (error) {
      console.error("[Cascading Client] Error analyzing sentiment:", error);
      // Sentiment failures are not critical, return null without notification
      return null;
    }
  }

  async complete(options: LLMCompletionOptions): Promise<string | null> {
    try {
      const response = await this.client.responses.create({
        model: options.model || this.config.defaultModel!,
        instructions: options.systemPrompt,
        input: options.userPrompt,
      });

      return this.extractTextFromResponse(response);
    } catch (error) {
      console.error("[Cascading Client] Error in completion:", error);
      await this.handleError(error as Error, "Completion");
      return null;
    }
  }

  private async handleError(error: Error, operation: string): Promise<void> {
    const isRateLimit =
      error.message.includes("429") || error.message.includes("rate limit");
    const isQuotaExceeded =
      error.message.includes("quota") || error.message.includes("insufficient_quota");

    if (isRateLimit || isQuotaExceeded) {
      if (this.config.onRateLimit) {
        await this.config.onRateLimit(error);
      }
    } else {
      if (this.config.onError) {
        await this.config.onError(error, operation);
      }
    }
  }
}
