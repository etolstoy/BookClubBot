import OpenAI from "openai";
import { config } from "../lib/config.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export interface ExtractedBookInfo {
  title: string;
  author: string | null;
  additionalContext: string | null;
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
  reviewText: string
): Promise<ExtractedBookInfo | null> {
  const systemPrompt = `You are a helpful assistant that extracts book information from review texts.
Extract the book title and author from the given review text.
Respond in JSON format only, with no additional text.

Response format:
{
  "title": "Book Title",
  "author": "Author Name or null if not found",
  "additionalContext": "Any additional context like translator, edition, etc. or null"
}

If you cannot identify a book title, respond with:
{
  "title": null,
  "author": null,
  "additionalContext": null
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
      console.log('[OpenAI] No content in response, trying regex fallback');
      return extractBookInfoWithRegex(reviewText);
    }

    const parsed = JSON.parse(content);

    if (!parsed.title) {
      console.log('[OpenAI] No title found, trying regex fallback');
      return extractBookInfoWithRegex(reviewText);
    }

    return {
      title: parsed.title,
      author: parsed.author || null,
      additionalContext: parsed.additionalContext || null,
    };
  } catch (error) {
    console.error("Error extracting book info:", error);
    console.log('[OpenAI] Error occurred, trying regex fallback');
    return extractBookInfoWithRegex(reviewText);
  }
}
