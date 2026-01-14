import OpenAI from "openai";
import { config } from "../lib/config.js";
import { sendErrorNotification, sendWarningNotification } from "./notification.service.js";
import type { ExtractedBookInfo } from "../bot/types/confirmation-state.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Extract book information using GPT-4o
 * @param reviewText - The review text to extract from
 * @param commandParams - Optional command parameters (e.g., "Title – Author" from /review command)
 * @returns ExtractedBookInfo or null if extraction fails
 */
export async function extractBookInfoGPT4o(
  reviewText: string,
  commandParams?: string
): Promise<ExtractedBookInfo | null> {
  const systemPrompt = `You are a helpful assistant that extracts book information from review texts or command parameters.

Extract the PRIMARY book being reviewed, along with any alternative spellings/transliterations and other mentioned books.

Respond with JSON only. Response format:
{
  "title": "Primary Book Title",
  "author": "Author Name or null if not found",
  "confidence": "high" | "medium" | "low",
  "alternativeBooks": [
    {"title": "Other Mentioned Book", "author": "Author or null"},
    ...
  ]
}

Guidelines:
- "title" is the PRIMARY book being reviewed (the main subject)
- Include transliterations (e.g., Russian ↔ English) in alternativeBooks if present
- Include books mentioned for comparison/reference (but NOT the primary subject) in alternativeBooks
- Limit alternativeBooks to maximum 3 entries
- "confidence" indicates how certain you are about the primary book identification
- Set confidence to "low" if multiple books seem equally important
- If command parameters are provided (format: "Title – Author"), extract from those first

If you cannot identify any book, respond with:
{
  "title": null,
  "author": null,
  "confidence": "low"
}`;

  try {
    const userContent = commandParams
      ? `Extract book information from these command parameters: "${commandParams}"\n\nContext (original review text for reference):\n${reviewText}`
      : `Extract book information from this review:\n\n${reviewText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log("[GPT-4o] No content in response");
      await sendWarningNotification("GPT-4o returned no content", {
        operation: "Book Extraction",
        additionalInfo: "Extraction failed - no content in response",
      });
      return null;
    }

    const parsed = JSON.parse(content);

    if (!parsed.title) {
      console.log("[GPT-4o] No title found in response");
      return null;
    }

    return {
      title: parsed.title,
      author: parsed.author || null,
      confidence: parsed.confidence || "medium",
      alternativeBooks: parsed.alternativeBooks || [],
    };
  } catch (error) {
    console.error("[GPT-4o] Error extracting book info:", error);

    // Send notification for critical errors
    if (error instanceof Error) {
      const isRateLimit =
        error.message.includes("429") || error.message.includes("rate limit");
      const isQuotaExceeded =
        error.message.includes("quota") || error.message.includes("insufficient_quota");

      if (isRateLimit || isQuotaExceeded) {
        await sendErrorNotification(error, {
          operation: "GPT-4o Book Extraction",
          additionalInfo: "Rate limit or quota exceeded. Check OpenAI billing.",
        });
      } else {
        await sendWarningNotification("GPT-4o extraction failed", {
          operation: "Book Info Extraction",
          additionalInfo: `Error: ${error.message}`,
        });
      }
    }

    return null;
  }
}
