import { PrismaClient } from "@prisma/client";
import { extractBookInfo } from "../../src/services/llm.js";

export async function process(limit?: number, autoConfirmHigh?: boolean): Promise<void> {
  const prisma = new PrismaClient();

  console.log("Staged Import: Process Stage");
  console.log("=".repeat(70));
  console.log(`Limit: ${limit || "no limit"}`);
  console.log(`Auto-confirm high confidence: ${autoConfirmHigh ? "yes" : "no"}`);
  console.log();

  // Fetch pending messages
  const pendingMessages = await prisma.stagedMessage.findMany({
    where: {
      status: "pending",
    },
    take: limit,
    orderBy: {
      reviewedAt: "asc",
    },
  });

  console.log(`Found ${pendingMessages.length} pending messages`);
  console.log();

  let processed = 0;
  let highConfidence = 0;
  let needsReview = 0;
  let failed = 0;

  for (const message of pendingMessages) {
    try {
      console.log(`[${processed + 1}/${pendingMessages.length}] Processing message ${message.messageId}...`);

      // Extract book info using LLM (skip regex fallback for import process)
      const bookInfo = await extractBookInfo(message.reviewText, { skipRegexFallback: true });

      if (!bookInfo) {
        // Extraction failed
        await prisma.stagedMessage.update({
          where: { id: message.id },
          data: { status: "failed" },
        });
        failed++;
        console.log(`  ✗ Extraction failed`);
        continue;
      }

      // Determine status based on confidence and alternatives
      const hasAlternatives = bookInfo.alternativeBooks && bookInfo.alternativeBooks.length > 0;
      const isHighConfidence = bookInfo.confidence === "high" && !hasAlternatives;
      const status = autoConfirmHigh && isHighConfidence ? "confirmed" : "needs_review";

      // Create StagedExtraction
      const extraction = await prisma.stagedExtraction.create({
        data: {
          title: bookInfo.title,
          author: bookInfo.author,
          confidence: bookInfo.confidence || "medium",
          titleVariants: bookInfo.titleVariants ? JSON.stringify(bookInfo.titleVariants) : null,
          authorVariants: bookInfo.authorVariants ? JSON.stringify(bookInfo.authorVariants) : null,
          alternativeBooks: bookInfo.alternativeBooks ? JSON.stringify(bookInfo.alternativeBooks) : null,
          additionalContext: bookInfo.additionalContext,
          status,
        },
      });

      // Update StagedMessage with link to extraction
      await prisma.stagedMessage.update({
        where: { id: message.id },
        data: {
          status: "extracted",
          extractionId: extraction.id,
        },
      });

      processed++;

      if (status === "confirmed") {
        highConfidence++;
        console.log(`  ✓ Extracted: "${bookInfo.title}" by ${bookInfo.author || "Unknown"} (${bookInfo.confidence}) [AUTO-CONFIRMED]`);
      } else {
        needsReview++;
        console.log(`  ⚠ Extracted: "${bookInfo.title}" by ${bookInfo.author || "Unknown"} (${bookInfo.confidence}) [NEEDS REVIEW]`);
      }

      // Rate limiting: wait 500ms between API calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ✗ Error processing message ${message.messageId}:`, error);
      failed++;
    }
  }

  console.log();
  console.log("Process complete!");
  console.log(`  Processed: ${processed}`);
  console.log(`  High confidence (auto-confirmed): ${highConfidence}`);
  console.log(`  Needs review: ${needsReview}`);
  console.log(`  Failed: ${failed}`);

  await prisma.$disconnect();
}
