#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function fixBabel() {
  const prisma = new PrismaClient();

  console.log("Fixing Babel books - merging English and Russian versions");
  console.log("=".repeat(70));
  console.log();

  const wrongBookId = 199; // "Babel: Or the Necessity of Violence..." (English)
  const correctBookId = 230; // "Вавилон. Сокрытая история" (Russian)

  // Get books info
  const wrongBook = await prisma.book.findUnique({ where: { id: wrongBookId } });
  const correctBook = await prisma.book.findUnique({ where: { id: correctBookId } });

  if (!wrongBook || !correctBook) {
    console.error("Error: Could not find one or both books");
    await prisma.$disconnect();
    return;
  }

  console.log(`English version: Book ${wrongBookId} - "${wrongBook.title}" by ${wrongBook.author}`);
  console.log(`Russian version: Book ${correctBookId} - "${correctBook.title}" by ${correctBook.author}`);
  console.log();

  // Get all reviews for the English version
  const reviews = await prisma.review.findMany({
    where: { bookId: wrongBookId },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${reviews.length} review(s) to move from English to Russian version`);
  console.log();

  // Move reviews
  for (const review of reviews) {
    console.log(`Moving review ${review.id} by ${review.telegramDisplayName}...`);
    console.log(`  Excerpt: ${review.reviewText.substring(0, 80).replace(/\n/g, ' ')}...`);

    await prisma.review.update({
      where: { id: review.id },
      data: { bookId: correctBookId },
    });

    console.log(`  ✓ Moved to book ${correctBookId}`);
  }

  console.log();

  // Check for any staged enrichments pointing to the wrong book
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: { bookId: wrongBookId },
  });

  if (enrichments.length > 0) {
    console.log(`Found ${enrichments.length} staged enrichment(s) to update...`);
    for (const enrichment of enrichments) {
      await prisma.stagedEnrichment.update({
        where: { id: enrichment.id },
        data: { bookId: correctBookId },
      });
    }
    console.log(`  ✓ Updated enrichments`);
    console.log();
  }

  // Delete the English version
  console.log(`Deleting English version book ${wrongBookId}...`);
  await prisma.book.delete({
    where: { id: wrongBookId },
  });
  console.log(`  ✓ Deleted book "${wrongBook.title}"`);
  console.log();

  console.log("=".repeat(70));

  // Show final count
  const finalCount = await prisma.review.count({ where: { bookId: correctBookId } });

  console.log("Summary:");
  console.log(`  Reviews moved: ${reviews.length}`);
  console.log(`  English book deleted: "${wrongBook.title}"`);
  console.log(`  "${correctBook.title}" now has: ${finalCount} reviews`);

  await prisma.$disconnect();
}

fixBabel().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
