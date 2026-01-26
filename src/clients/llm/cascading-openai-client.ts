/**
 * Cascading OpenAI Client Implementation
 * Multi-step pipeline: nano model first, escalating to GPT-4.1 when needed
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

/**
 * Pipeline modes for book extraction:
 * - "nano-only": Only use nano model for title and author (fastest, cheapest)
 * - "nano-with-fallback": Nano first, fall back to full model if needed (no web search)
 * - "full": Complete pipeline with web search fallback for author (most accurate)
 */
export type PipelineMode = "nano-only" | "nano-with-fallback" | "full";

/**
 * Extended config for CascadingOpenAIClient
 */
export interface CascadingClientConfig extends LLMClientConfig {
  pipelineMode?: PipelineMode;
}

/**
 * Metrics tracked during extraction pipeline
 */
export interface PipelineMetrics {
  fullModelFallbacks: number;
  webSearchFallbacks: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// Internal types for pipeline steps
interface TitleExtractionResult {
  title: string | null;
  confidence: LLMConfidence;
}

interface AuthorExtractionResult {
  author: string | null;
  confidence: LLMConfidence;
}

interface FullExtractionResult {
  title: string | null;
  author: string | null;
  confidence: LLMConfidence;
}

// JSON Schemas for Structured Outputs
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

const fullExtractionSchema = {
  type: "json_schema" as const,
  name: "full_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "The canonical book title" },
      author: { type: ["string", "null"], description: "The author name" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["title", "author", "confidence"],
    additionalProperties: false,
  },
};

/**
 * Cascading OpenAI implementation of ILLMClient
 * Uses cheap nano model first, escalates to GPT-4.1 (with web search) when needed
 * All calls use Responses API with Structured Outputs
 */
export class CascadingOpenAIClient implements ILLMClient {
  private client: OpenAI;
  private config: LLMClientConfig;
  private readonly pipelineMode: PipelineMode;

  // Model constants
  private readonly NANO_MODEL = "gpt-5-nano";
  private readonly FULL_MODEL = "gpt-5.2";

  // Metrics tracking
  private metrics: PipelineMetrics = {
    fullModelFallbacks: 0,
    webSearchFallbacks: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };

  constructor(config: CascadingClientConfig) {
    this.config = {
      defaultModel: "gpt-5-nano",
      defaultTemperature: 1,
      ...config,
    };
    this.pipelineMode = config.pipelineMode ?? "full";
    this.client = new OpenAI({ apiKey: this.config.apiKey });
    console.log(`[Cascading Client] Initialized with pipeline mode: ${this.pipelineMode}`);
  }

  /**
   * Get current pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset pipeline metrics
   */
  resetMetrics(): void {
    this.metrics = {
      fullModelFallbacks: 0,
      webSearchFallbacks: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  /**
   * Track token usage from API response
   */
  private trackUsage(response: OpenAI.Responses.Response): void {
    if (response.usage) {
      this.metrics.totalInputTokens += response.usage.input_tokens || 0;
      this.metrics.totalOutputTokens += response.usage.output_tokens || 0;
    }
  }

  /**
   * Extract book information using cascading pipeline.
   * Pipeline behavior depends on pipelineMode:
   * - "nano-only": Only nano model for title and author (no fallbacks)
   * - "nano-with-fallback": Nano first, full model fallback (no web search)
   * - "full": Complete pipeline with web search fallback for author
   */
  async extractBookInfo(
    reviewText: string,
    commandParams?: string
  ): Promise<ExtractedBookInfo | null> {
    const userContent = commandParams
      ? `Extract book information from these command parameters: "${commandParams}"\n\nContext (original review text for reference):\n${reviewText}`
      : reviewText;

    console.log(`[Cascading Client] Starting extraction pipeline (mode: ${this.pipelineMode})`);

    // Step 1: Always extract title with nano model
    const titleResult = await this.extractTitleWithNano(userContent);
    console.log("[Cascading Client] Step 1 (nano title):", JSON.stringify(titleResult));

    // Mode: nano-only - no fallback for title, just use nano for author
    if (this.pipelineMode === "nano-only") {
      if (!titleResult.title) {
        console.log("[Cascading Client] No title from nano, returning null (nano-only mode)");
        return null;
      }

      const authorResult = await this.extractAuthorWithNano(userContent, titleResult.title);
      console.log("[Cascading Client] Nano author result:", JSON.stringify(authorResult));

      return {
        title: titleResult.title,
        author: authorResult.author,
        confidence: this.combineConfidence(titleResult.confidence, authorResult.confidence),
        alternativeBooks: [],
      };
    }

    // Modes: nano-with-fallback or full - fallback to full model if nano title fails
    if (!titleResult.title || titleResult.confidence === "low") {
      console.log("[Cascading Client] Escalating to full model extraction");
      this.metrics.fullModelFallbacks++;
      const fullResult = await this.extractWithFullModel(userContent);
      console.log("[Cascading Client] Full model result:", JSON.stringify(fullResult));

      if (!fullResult.title) {
        console.log("[Cascading Client] No title found, returning null");
        return null;
      }

      if (fullResult.confidence === "low") {
        console.log("[Cascading Client] Low confidence from full model, returning null");
        return null;
      }

      // Full model gives both title and author, no further fallback needed
      return {
        title: fullResult.title,
        author: fullResult.author,
        confidence: fullResult.confidence,
        alternativeBooks: [],
      };
    }

    // Step 3: High confidence title → extract author with nano
    console.log("[Cascading Client] Step 3 (nano author)");
    const authorResult = await this.extractAuthorWithNano(userContent, titleResult.title);
    console.log("[Cascading Client] Nano author result:", JSON.stringify(authorResult));

    // Mode: nano-with-fallback - no web search, return what we have
    if (this.pipelineMode === "nano-with-fallback") {
      return {
        title: titleResult.title,
        author: authorResult.author,
        confidence: this.combineConfidence(titleResult.confidence, authorResult.confidence),
        alternativeBooks: [],
      };
    }

    // Mode: full - web search fallback for weak author
    if (!authorResult.author || authorResult.confidence === "low") {
      console.log("[Cascading Client] Escalating to web search for author");
      this.metrics.webSearchFallbacks++;
      const webSearchAuthor = await this.extractAuthorWithWebSearch(titleResult.title, userContent);
      console.log("[Cascading Client] Web search result:", JSON.stringify(webSearchAuthor));

      return {
        title: titleResult.title,
        author: webSearchAuthor.author,
        confidence: this.combineConfidence(titleResult.confidence, webSearchAuthor.confidence),
        alternativeBooks: [],
      };
    }

    // Success path: both title and author from nano
    return {
      title: titleResult.title,
      author: authorResult.author,
      confidence: this.combineConfidence(titleResult.confidence, authorResult.confidence),
      alternativeBooks: [],
    };
  }

  /**
   * Extract text output from Responses API response
   */
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

  /**
   * Step 1: Extract title using nano model (Responses API)
   */
  private async extractTitleWithNano(userContent: string): Promise<TitleExtractionResult> {
    const instructions = `Extract the primary book title from this review.

Rules:
- Identify the main book being reviewed
- Use canonical ENGLISH title for non-Russian works
- Use Cyrillic title for Russian-original works
- "high": title explicitly mentioned with quotes or clear attribution
- "medium": title clearly identifiable from context
- "low": title uncertain or multiple candidates`;

    try {
      const response = await this.client.responses.create({
        model: this.NANO_MODEL,
        instructions,
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

  /**
   * Step 3: Extract author using nano model (given known title)
   */
  private async extractAuthorWithNano(
    userContent: string,
    title: string
  ): Promise<AuthorExtractionResult> {
    const instructions = `Given the book title "${title}", extract the author from this review.

Rules:
- Use Latin script for non-Russian authors (diacritics allowed)
- Use Cyrillic for Russian authors
- Use "GivenName Surname" format, no patronymics
- Use full first name, not initials
- "high": author explicitly mentioned
- "medium": author inferable from context
- "low": author uncertain or not found`;

    try {
      const response = await this.client.responses.create({
        model: this.NANO_MODEL,
        instructions,
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

  /**
   * Step 2: Full extraction using GPT-4.1 (fallback when nano fails)
   */
  private async extractWithFullModel(userContent: string): Promise<FullExtractionResult> {
    const instructions = `You extract canonical book info from a review text and/or command parameters.

Process (must follow in order):
Step 1 — Entity resolution:
  - Identify the underlying book (work entity) from any language variants.
  - Determine a single flag: Is the work originally written/published in Russian? (yes/no)
    - IMPORTANT: Do NOT treat Cyrillic in the review as evidence of Russian-original. In Russian reviews, Cyrillic titles/authors are often localized translations.
    - Mark Russian-original = yes ONLY with strong positive evidence (e.g., clearly Russian-language author identity, or explicit statement it is a Russian original).
    - If uncertain, Russian-original = no.

Step 2 — Output normalization (this is what you OUTPUT):
  - If Russian-original = yes:
    - title = canonical Russian title (Cyrillic)
    - author = canonical Russian author name (Cyrillic)
  - If Russian-original = no:
    - title = canonical ENGLISH publication title (even if the review mentions a Russian/Italian/Spanish/etc title)
    - author = canonical Latin-script author name (diacritics allowed), in "GivenName Surname" order
    - Do NOT output transliteration of Cyrillic titles; do NOT output Russian translated titles for non-Russian originals.
  - Use full author first name, not just initials.
  - Remove the patronymic from Russian names.

Hard validation before final output (must apply):
  - If Russian-original = no, title and author MUST NOT contain Cyrillic characters. If they do, correct to English/Latin canonical forms; if you cannot confidently resolve, keep best English guess and set confidence="low" (do not switch to Cyrillic).
  - If Russian-original = yes, title and author MUST be Cyrillic (no Latin transliteration).

Confidence:
  - high: explicit title/author or unambiguous canonical match.
  - medium: inferred author or title but strong evidence.
  - low: weak evidence or multiple plausible primary books.`;

    try {
      const response = await this.client.responses.create({
        model: this.FULL_MODEL,
        instructions,
        input: `Extract book information from this review:\n\n${userContent}`,
        text: { format: fullExtractionSchema },
      });

      this.trackUsage(response);
      const content = this.extractTextFromResponse(response);
      if (!content) {
        return { title: null, author: null, confidence: "low" };
      }

      const parsed = JSON.parse(content);
      return {
        title: parsed.title || null,
        author: parsed.author || null,
        confidence: parsed.confidence || "low",
      };
    } catch (error) {
      console.error("[Cascading Client] Error in full model extraction:", error);
      await this.handleError(error as Error, "Full Model Extraction");
      return { title: null, author: null, confidence: "low" };
    }
  }

  /**
   * Step 4: Extract author using GPT-4.1 with web search (Responses API)
   */
  private async extractAuthorWithWebSearch(
    title: string,
    userContent: string
  ): Promise<AuthorExtractionResult> {
    try {
      const response = await this.client.responses.create({
        model: this.FULL_MODEL,
        input: `Find the author of the book "${title}". 
        
Context from review: ${userContent.substring(0, 500)}

Return the author name in the correct format:
- Latin script for non-Russian authors (diacritics allowed)
- Cyrillic for Russian authors
- "GivenName Surname" format, no patronymics
- Full first name, not initials`,
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

  /**
   * Combine confidence levels from multiple steps
   */
  private combineConfidence(
    titleConfidence: LLMConfidence,
    authorConfidence: LLMConfidence
  ): LLMConfidence {
    // If either is low, result is low
    if (titleConfidence === "low" || authorConfidence === "low") {
      return "low";
    }
    // If either is medium, result is medium
    if (titleConfidence === "medium" || authorConfidence === "medium") {
      return "medium";
    }
    // Both high
    return "high";
  }

  /**
   * Stub implementation - returns "positive" without API call
   */
  async analyzeSentiment(_reviewText: string): Promise<Sentiment | null> {
    console.log("[Cascading Client] analyzeSentiment called (stub returning 'positive')");
    return "positive";
  }

  /**
   * Generic completion method for custom prompts (uses Responses API)
   */
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

  /**
   * Centralized error handling with callbacks
   */
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
