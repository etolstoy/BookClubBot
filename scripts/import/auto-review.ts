import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { config } from "../../src/lib/config.js";

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

interface AutoReviewResult {
  title: string;
  author: string | null;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  originalTitle?: string;
}

async function autoReviewExtraction(
  reviewText: string,
  extraction: {
    title: string;
    author: string | null;
    alternativeBooks: string | null;
  }
): Promise<AutoReviewResult | null> {
  const alternatives = extraction.alternativeBooks
    ? JSON.parse(extraction.alternativeBooks)
    : [];

  const prompt = `You are a book review analyzer. A review has been processed and the system identified a primary book and some alternatives. Your task is to determine which book is actually being reviewed.

Review Text:
"""
${reviewText}
"""

Primary Extraction:
  Title: "${extraction.title}"
  Author: ${extraction.author || "Unknown"}

${
  alternatives.length > 0
    ? `Alternative Books Mentioned:
${alternatives
  .map(
    (alt: { title: string; author: string | null }, idx: number) =>
      `  ${idx + 1}. "${alt.title}" by ${alt.author || "Unknown"}`
  )
  .join("\n")}`
    : "No alternatives identified."
}

Analyze the review carefully and determine:
1. Which book is the PRIMARY subject of this review (the one being reviewed)
2. Are other books just mentioned for comparison/reference?

IMPORTANT GUIDELINES FOR TITLE AND AUTHOR:
- If the book is a TRANSLATION of a foreign work, provide the ORIGINAL ENGLISH title (e.g., "1984" not "1984 (роман)")
- For Russian books, keep the Russian title (e.g., "Мастер и Маргарита")
- For AUTHOR NAMES (CRITICAL - ALWAYS USE FULL NAMES):
  - ALWAYS provide FULL author name (first name + last name, no initials)
  - If the review only mentions last name, USE YOUR KNOWLEDGE to find the full name
  - If you cannot determine the full name with certainty, return null rather than just last name
  - If author is NOT Russian/Soviet, provide the English spelling (e.g., "George Orwell" not "Джордж Оруэлл")
  - If author IS Russian/Soviet, keep the Russian name (e.g., "Михаил Булгаков" not "М. Булгаков")
  - Use transliteration for Russian authors if commonly known (e.g., "Fyodor Dostoevsky" is acceptable for "Фёдор Достоевский")
  - NEVER use just last name ("Подшибякин") or initials ("М. Булгаков") - always "FirstName LastName" format or null
  - Examples: "Ray Dalio" (not "Dalio"), "Alan Moore" (not "Moore"), "Михаил Булгаков" (not "Булгаков")
- Store the Russian title (if different) in originalTitle field

Respond with JSON only:
{
  "title": "The correct book title (English for translations, Russian for Russian books)",
  "author": "FULL author name - FirstName LastName (English for non-Russians, Russian/transliterated for Russians) or null",
  "originalTitle": "Russian title if 'title' is in English, otherwise null",
  "reasoning": "Brief explanation of your decision",
  "confidence": "high" | "medium" | "low"
}

Example responses:
- Foreign book: {"title": "1984", "author": "George Orwell", "originalTitle": "1984 (роман)", ...}
- Russian book: {"title": "Мастер и Маргарита", "author": "Михаил Булгаков", "originalTitle": null, ...}`;

  try {
    const modelUsed = "gpt-4o";
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log(`  ✗ No response from ${modelUsed}`);
      return null;
    }

    // Log token usage and cost if available
    if (response.usage) {
      const inputTokens = response.usage.prompt_tokens;
      const outputTokens = response.usage.completion_tokens;
      console.log(`  → Model: ${modelUsed} | Tokens: ${inputTokens} in, ${outputTokens} out`);
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("  ✗ Could not extract JSON from response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.title) {
      console.log("  ✗ No title in response");
      return null;
    }

    return {
      title: parsed.title,
      author: parsed.author || null,
      reasoning: parsed.reasoning || "No reasoning provided",
      confidence: parsed.confidence || "medium",
      originalTitle: parsed.originalTitle || undefined,
    };
  } catch (error) {
    console.error("  ✗ Error calling AI model:", error);
    return null;
  }
}

export async function autoReview(limit?: number, dryRun?: boolean): Promise<void> {
  const prisma = new PrismaClient();

  console.log("Staged Import: Auto-Review with AI (Step 2.5)");
  console.log("=".repeat(70));
  console.log(`Model: gpt-4o`);
  console.log(`Limit: ${limit || "no limit"}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log();

  // Fetch extractions needing review
  const extractions = await prisma.stagedExtraction.findMany({
    where: {
      status: "needs_review",
    },
    include: {
      stagedMessage: true,
    },
    take: limit,
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${extractions.length} extractions needing auto-review`);
  console.log();

  if (extractions.length === 0) {
    console.log("No extractions to auto-review!");
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let confirmed = 0;
  let edited = 0;
  let failed = 0;
  let totalCost = 0;

  for (const extraction of extractions) {
    const message = extraction.stagedMessage;

    if (!message) {
      console.error(`Error: No message found for extraction ${extraction.id}`);
      failed++;
      continue;
    }

    console.log(`[${processed + 1}/${extractions.length}] Auto-reviewing extraction ${extraction.id}...`);
    console.log(`  Primary: "${extraction.title}" by ${extraction.author || "Unknown"}`);

    const result = await autoReviewExtraction(message.reviewText, {
      title: extraction.title,
      author: extraction.author,
      alternativeBooks: extraction.alternativeBooks,
    });

    if (!result) {
      failed++;
      console.log(`  ✗ Failed to auto-review`);
      processed++;
      continue;
    }

    console.log(`  → Decision: "${result.title}" by ${result.author || "Unknown"}`);
    if (result.originalTitle) {
      console.log(`  → Russian title: "${result.originalTitle}"`);
    }
    console.log(`  → Confidence: ${result.confidence}`);
    console.log(`  → Reasoning: ${result.reasoning.substring(0, 100)}...`);

    // Estimate cost (gpt-4o: $2.50/M input, $10.00/M output)
    // Rough estimate: ~700 input tokens, ~100 output tokens per request
    const estimatedCost = (700 * 2.5 + 100 * 10.0) / 1_000_000;
    totalCost += estimatedCost;

    if (dryRun) {
      console.log(`  [DRY RUN] Would update extraction`);
      confirmed++;
      processed++;
      continue;
    }

    // Check if result matches primary or is different
    const isPrimary =
      result.title.toLowerCase() === extraction.title.toLowerCase() &&
      (result.author || "").toLowerCase() === (extraction.author || "").toLowerCase();

    // Prepare title variants if we have a Russian title different from the main title
    const titleVariants = extraction.titleVariants ? JSON.parse(extraction.titleVariants) : [];
    if (result.originalTitle && result.originalTitle !== result.title) {
      // Add Russian title as variant if not already present
      if (!titleVariants.includes(result.originalTitle)) {
        titleVariants.push(result.originalTitle);
      }
    }
    const titleVariantsJson = titleVariants.length > 0 ? JSON.stringify(titleVariants) : extraction.titleVariants;

    if (isPrimary) {
      // Confirm primary extraction (but update variants if we have Russian title)
      await prisma.stagedExtraction.update({
        where: { id: extraction.id },
        data: {
          status: "confirmed",
          titleVariants: titleVariantsJson,
          additionalContext: `Auto-reviewed by GPT-4o: ${result.reasoning}`,
        },
      });
      confirmed++;
      console.log(`  ✓ Confirmed primary extraction`);
    } else {
      // Edit to use GPT-4o's choice
      await prisma.stagedExtraction.update({
        where: { id: extraction.id },
        data: {
          status: "edited",
          confirmedTitle: result.title,
          confirmedAuthor: result.author,
          titleVariants: titleVariantsJson,
          additionalContext: `Auto-reviewed by GPT-4o: ${result.reasoning}`,
        },
      });
      edited++;
      console.log(`  ✓ Edited to use GPT-4o choice`);
    }

    processed++;

    // Rate limiting: wait 1 second between requests to avoid hitting rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log();
  console.log("Auto-review complete!");
  console.log(`  Processed: ${processed}`);
  console.log(`  Confirmed primary: ${confirmed}`);
  console.log(`  Edited to alternative: ${edited}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Estimated cost: $${totalCost.toFixed(3)}`);

  if (dryRun) {
    console.log();
    console.log("This was a dry run. No data was saved.");
  }

  await prisma.$disconnect();
}
