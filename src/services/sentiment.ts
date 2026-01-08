import OpenAI from "openai";
import { config } from "../lib/config.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

export type Sentiment = "positive" | "negative" | "neutral";

export async function analyzeSentiment(
  reviewText: string
): Promise<Sentiment | null> {
  const systemPrompt = `Analyze the following book review and classify the reviewer's sentiment.
Return ONLY one of: "positive", "negative", or "neutral"

Guidelines:
- "positive": The reviewer recommends the book, enjoyed it, or speaks highly of it
- "negative": The reviewer does not recommend the book, disliked it, or criticizes it
- "neutral": Mixed feelings, informational review without clear recommendation, or balanced pros/cons`;

  try {
    const response = await openai.chat.completions.create({
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

    console.warn(`Unexpected sentiment response: ${content}`);
    return null;
  } catch (error) {
    console.error("Error analyzing sentiment:", error);
    return null;
  }
}
