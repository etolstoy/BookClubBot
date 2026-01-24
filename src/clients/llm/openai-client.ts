/**
 * OpenAI Client Implementation
 * Real implementation of ILLMClient using OpenAI API
 */

import OpenAI from "openai";
import type {
  ILLMClient,
  LLMClientConfig,
  ExtractedBookInfo,
  Sentiment,
  LLMCompletionOptions,
} from "../../lib/interfaces/index.js";

/**
 * OpenAI implementation of ILLMClient
 * Handles book extraction and sentiment analysis using GPT models
 */
export class OpenAIClient implements ILLMClient {
  private client: OpenAI;
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = {
      defaultModel: "gpt-4o",
      defaultTemperature: 0.1,
      ...config,
    };
    this.client = new OpenAI({ apiKey: this.config.apiKey });
  }

  /**
   * Extract book information from review text using GPT-4o
   * Moved from book-extraction.service.ts
   */
  async extractBookInfo(
    reviewText: string,
    commandParams?: string
  ): Promise<ExtractedBookInfo | null> {
    const systemPrompt = `You extract canonical book info from a review text and/or command parameters.

  Return JSON ONLY matching exactly this schema (no extra keys, no markdown):
  {
    "title": string|null,
    "author": string|null,
    "confidence": "high"|"medium"|"low",
    "alternativeBooks": [{"title": string, "author": string|null}]
  }

  Decision order:
	1.	If command parameters exist in format “Title – Author”, use them as PRIMARY.
	2.	Otherwise identify the PRIMARY book being reviewed (main subject). If unclear, pick the FIRST mentioned.
	3.	Put up to 3 other mentioned books (comparison/reference) into alternativeBooks.
    
  Canonicalization (critical):
  - Do not infer original language from the language/script used in the review. First identify the work (entity). Then output canonical original-edition title/author in the original language.
  - Output the canonical ORIGINAL-EDITION title and the canonical author name (entity resolution).
  - Output must be in the language/script of the original edition (first publication).
    - If the work was originally published in Russian, output title in Cyrillic Russian and author in Cyrillic Russian (no Latin transliteration).
    - If originally published in English, output both in English Latin (no Cyrillic localized titles).
	- If the author is an English-language author, the title MUST be in English (Latin script). If your draft title is Cyrillic for a non-Russian author, re-resolve to the original title.
	- Author name should be the canonical form (not translated). If missing, you MAY infer it from the identified book.

  Confidence:
	- high: explicit title/author or unambiguous canonical match.
	- medium: inferred author or title but strong evidence.
	- low: weak evidence or multiple plausible primary books.

  Always return at least one primary book if any book is mentioned. If no book can be identified at all:
  {
    "title": null,
    "author": null,
    "confidence": "low",
    "alternativeBooks": []
  }
  `
    try {
      const userContent = commandParams
        ? `Extract book information from these command parameters: "${commandParams}"\n\nContext (original review text for reference):\n${reviewText}`
        : `Extract book information from this review:\n\n${reviewText}`;

      const response = await this.client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.log("[OpenAI Client] No content in response");
        if (this.config.onError) {
          await this.config.onError(
            new Error("No content in response"),
            "Book Extraction"
          );
        }
        return null;
      }

      const parsed = JSON.parse(content);

      console.log(
        "[OpenAI Client] Parsed response:",
        JSON.stringify({
          title: parsed.title,
          author: parsed.author,
          confidence: parsed.confidence,
          alternativesCount: parsed.alternativeBooks?.length || 0,
        })
      );

      // If no primary title but we have alternatives, promote first alternative to primary
      if (!parsed.title && parsed.alternativeBooks && parsed.alternativeBooks.length > 0) {
        console.log(
          "[OpenAI Client] No primary title, promoting first alternative to primary"
        );
        const firstAlt = parsed.alternativeBooks[0];
        return {
          title: firstAlt.title,
          author: firstAlt.author || null,
          confidence: "low",
          alternativeBooks: parsed.alternativeBooks.slice(1),
        };
      }

      if (!parsed.title) {
        console.log("[OpenAI Client] No title found and no alternatives");
        return null;
      }

      return {
        title: parsed.title,
        author: parsed.author || null,
        confidence: parsed.confidence || "medium",
        alternativeBooks: parsed.alternativeBooks || [],
      };
    } catch (error) {
      console.error("[OpenAI Client] Error extracting book info:", error);
      await this.handleError(error as Error, "Book Extraction");
      return null;
    }
  }

  /**
   * Analyze sentiment of review text using GPT-4o-mini
   * Moved from sentiment.ts
   */
  async analyzeSentiment(reviewText: string): Promise<Sentiment | null> {
    const systemPrompt = `Analyze the following book review and classify the reviewer's sentiment.
Return ONLY one of: "positive", "negative", or "neutral"

Guidelines:
- "positive": The reviewer recommends the book, enjoyed it, or speaks highly of it
- "negative": The reviewer does not recommend the book, disliked it, or criticizes it
- "neutral": Mixed feelings, informational review without clear recommendation, or balanced pros/cons`;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Review text:\n\n${reviewText}` },
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      const content = response.choices[0]?.message?.content?.trim().toLowerCase();

      if (content === "positive" || content === "negative" || content === "neutral") {
        return content;
      }

      // Try to parse if there's extra text
      if (content?.includes("positive")) return "positive";
      if (content?.includes("negative")) return "negative";
      if (content?.includes("neutral")) return "neutral";

      console.warn(`[OpenAI Client] Unexpected sentiment response: ${content}`);
      return null;
    } catch (error) {
      console.error("[OpenAI Client] Error analyzing sentiment:", error);
      // Sentiment failures are not critical, return null without notification
      return null;
    }
  }

  /**
   * Generic completion method for custom prompts
   * For future extensibility
   */
  async complete(options: LLMCompletionOptions): Promise<string | null> {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.defaultModel!,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        temperature: options.temperature ?? this.config.defaultTemperature,
        max_tokens: options.maxTokens,
      });

      return response.choices[0]?.message?.content || null;
    } catch (error) {
      console.error("[OpenAI Client] Error in completion:", error);
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
