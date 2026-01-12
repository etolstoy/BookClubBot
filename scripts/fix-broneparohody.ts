#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function fixBroneparohody() {
  const prisma = new PrismaClient();

  console.log("Fixing Broneparohody books - merging duplicate");
  console.log("=".repeat(70));
  console.log();

  const wrongBookId = 51; // "Алексей Иванов. Бронепароходы. Рецензия" by Сергей Овчинников
  const correctBookId = 246; // "Бронепароходы" by Алексей Иванов

  // Get books info
  const wrongBook = await prisma.book.findUnique({ where: { id: wrongBookId } });
  const correctBook = await prisma.book.findUnique({ where: { id: correctBookId } });

  if (!wrongBook || !correctBook) {
    console.error("Error: Could not find one or both books");
    await prisma.$disconnect();
    return;
  }

  console.log(`Wrong book:   Book ${wrongBookId} - "${wrongBook.title}" by ${wrongBook.author}`);
  console.log(`Correct book: Book ${correctBookId} - "${correctBook.title}" by ${correctBook.author}`);
  console.log();

  // Get all reviews for the wrong book
  const reviews = await prisma.review.findMany({
    where: { bookId: wrongBookId },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${reviews.length} reviews to move from wrong book to correct book`);
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
    console.log(`Found ${enrichments.length} staged enrichments to update...`);
    for (const enrichment of enrichments) {
      await prisma.stagedEnrichment.update({
        where: { id: enrichment.id },
        data: { bookId: correctBookId },
      });
    }
    console.log(`  ✓ Updated enrichments`);
    console.log();
  }

  // Delete the wrong book
  console.log(`Deleting wrong book ${wrongBookId}...`);
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
  console.log(`  Wrong book deleted: "${wrongBook.title}"`);
  console.log(`  "${correctBook.title}" now has: ${finalCount} reviews`);

  await prisma.$disconnect();
}

fixBroneparohody().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
