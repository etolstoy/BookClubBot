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
      return null;
    }

    const parsed = JSON.parse(content);

    if (!parsed.title) {
      return null;
    }

    return {
      title: parsed.title,
      author: parsed.author || null,
      additionalContext: parsed.additionalContext || null,
    };
  } catch (error) {
    console.error("Error extracting book info:", error);
    return null;
  }
}
