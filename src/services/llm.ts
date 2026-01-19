/**
 * @deprecated This service is legacy and maintained for backward compatibility only.
 * Use book-extraction.service.ts with OpenAIClient instead.
 * This file will be removed in a future version.
 */

import OpenAI from "openai";
import { config } from "../lib/config.js";
import { sendErrorNotification, sendWarningNotification } from "./notification.service.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface ExtractedBookInfo {
  title: string;
  author: string | null;
  additionalContext: string | null;
  titleVariants?: string[];
  authorVariants?: string[];
  confidence?: "high" | "medium" | "low";
  alternativeBooks?: Array<{
    title: string;
    author: string | null;
  }>;
}

/**
 * Fallback function to extract book info using regex patterns
 * Used when OpenAI API is unavailable or fails
 */
function extractBookInfoWithRegex(reviewText: string): ExtractedBookInfo | null {
  // Common patterns for book references:
  // "Title" by Author
  // «Title» by Author
  // "Title" - Author
  // Book: "Title"

  const patterns = [
    // "Title" by Author or «Title» by Author
    /["«»""]([^"«»""]+)["«»""]\s+(?:by|автор|от)\s+([^.\n]+)/i,
    // "Title" - Author
    /["«»""]([^"«»""]+)["«»""]\s*[-–—]\s*([^.\n]+)/i,
    // Book: "Title" or just "Title" at the start
    /(?:book|книга)?\s*[:—]?\s*["«»""]([^"«»""]+)["«»""]/i,
  ];

  for (const pattern of patterns) {
    const match = reviewText.match(pattern);
    if (match) {
      const title = match[1]?.trim();
      const author = match[2]?.trim() || null;

      if (title && title.length >= 2) {
        console.log('[Regex Fallback] Extracted book:', { title, author });
        return {
          title,
          author,
          additionalContext: null,
        };
      }
    }
  }

  // If no pattern matched, try to find quoted text (likely a title)
  const quotedText = reviewText.match(/["«»""]([^"«»""]+)["«»""]/);
  if (quotedText && quotedText[1] && quotedText[1].length >= 2) {
    console.log('[Regex Fallback] Extracted title from quotes:', quotedText[1]);
    return {
      title: quotedText[1].trim(),
      author: null,
      additionalContext: null,
    };
  }

  return null;
}

export async function extractBookInfo(
  reviewText: string,
  options?: { skipRegexFallback?: boolean }
): Promise<ExtractedBookInfo | null> {
  const skipRegexFallback = options?.skipRegexFallback || false;
  const systemPrompt = `You are a helpful assistant that extracts book information from review texts.
Extract the PRIMARY book being reviewed, along with any alternative spellings/transliterations and other mentioned books.

Respond with JSON only. Response format:
{
  "title": "Primary Book Title",
  "author": "Author Name or null if not found",
  "additionalContext": "Any additional context like translator, edition, etc. or null",
  "titleVariants": ["Alternative Title Spelling", "Transliterated Title", ...],
  "authorVariants": ["Alternative Author Spelling", "Transliterated Name", ...],
  "confidence": "high" | "medium" | "low",
  "alternativeBooks": [
    {"title": "Other Mentioned Book", "author": "Author or null"},
    ...
  ]
}

Guidelines:
- "title" is the PRIMARY book being reviewed (the main subject)
- Include transliterations (e.g., Russian ↔ English) in variants
- Include common alternative spellings in variants
- "alternativeBooks" are books mentioned for comparison/reference but NOT the primary subject
- "confidence" indicates how certain you are about the primary book identification
- Set confidence to "low" if multiple books seem equally important

If you cannot identify any book, respond with:
{
  "title": null,
  "author": null,
  "additionalContext": null,
  "confidence": "low"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Extract book information from this review:\n\n${reviewText}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      if (skipRegexFallback) {
        console.log('[OpenAI] No content in response, marking for manual review');
        return {
          title: "[Manual review required]",
          author: null,
          additionalContext: "OpenAI returned no content",
          confidence: "low",
        };
      }
      console.log('[OpenAI] No content in response, trying regex fallback');
      return extractBookInfoWithRegex(reviewText);
    }

    const parsed = JSON.parse(content);

    if (!parsed.title) {
      if (skipRegexFallback) {
        console.log('[OpenAI] No title found, marking for manual review');
        return {
          title: "[Manual review required]",
          author: parsed.author || null,
          additionalContext: "OpenAI could not identify a book title",
          confidence: "low",
        };
      }
      console.log('[OpenAI] No title found, trying regex fallback');
      return extractBookInfoWithRegex(reviewText);
    }

    return {
      title: parsed.title,
      author: parsed.author || null,
      additionalContext: parsed.additionalContext || null,
      titleVariants: parsed.titleVariants || [],
      authorVariants: parsed.authorVariants || [],
      confidence: parsed.confidence || "medium",
      alternativeBooks: parsed.alternativeBooks || [],
    };
  } catch (error) {
    console.error("Error extracting book info:", error);

    if (skipRegexFallback) {
      console.log('[OpenAI] Error occurred, marking for manual review');
      // Send notification for critical errors (rate limit, API errors, etc.)
      if (error instanceof Error) {
        const isRateLimit = error.message.includes('429') || error.message.includes('rate limit');
        const isQuotaExceeded = error.message.includes('quota') || error.message.includes('insufficient_quota');

        if (isRateLimit || isQuotaExceeded) {
          await sendErrorNotification(error, {
            operation: "OpenAI Book Extraction",
            additionalInfo: "Marked for manual review. Consider checking OpenAI billing.",
          });
        } else {
          await sendWarningNotification("OpenAI extraction failed", {
            operation: "Book Info Extraction",
            additionalInfo: `Error: ${error.message}. Marked for manual review.`,
          });
        }
      }
      return {
        title: "[Manual review required]",
        author: null,
        additionalContext: error instanceof Error ? `Error: ${error.message}` : "Unknown error",
        confidence: "low",
      };
    }

    console.log('[OpenAI] Error occurred, trying regex fallback');

    // Send notification for critical errors (rate limit, API errors, etc.)
    if (error instanceof Error) {
      const isRateLimit = error.message.includes('429') || error.message.includes('rate limit');
      const isQuotaExceeded = error.message.includes('quota') || error.message.includes('insufficient_quota');

      if (isRateLimit || isQuotaExceeded) {
        await sendErrorNotification(error, {
          operation: "OpenAI Book Extraction",
          additionalInfo: "Falling back to regex extraction. Consider checking OpenAI billing.",
        });
      } else {
        await sendWarningNotification("OpenAI extraction failed", {
          operation: "Book Info Extraction",
          additionalInfo: `Error: ${error.message}. Using regex fallback.`,
        });
      }
    }

    return extractBookInfoWithRegex(reviewText);
  }
}
