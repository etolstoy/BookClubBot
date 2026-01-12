#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function fixChurchillToAverin() {
  const prisma = new PrismaClient();

  console.log("Moving reviews from Churchill book to Graf Averin book");
  console.log("=".repeat(70));
  console.log();

  const fromBookId = 323; // Уинстон Черчилль. Темные времена
  const toBookId = 578; // Граф Аверин

  // Get books info
  const fromBook = await prisma.book.findUnique({ where: { id: fromBookId } });
  const toBook = await prisma.book.findUnique({ where: { id: toBookId } });

  if (!fromBook || !toBook) {
    console.error("Error: Could not find one or both books");
    await prisma.$disconnect();
    return;
  }

  console.log(`From: Book ${fromBookId} - "${fromBook.title}" by ${fromBook.author}`);
  console.log(`To:   Book ${toBookId} - "${toBook.title}" by ${toBook.author}`);
  console.log();

  // Get all reviews for the Churchill book
  const reviews = await prisma.review.findMany({
    where: { bookId: fromBookId },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${reviews.length} reviews to move`);
  console.log();

  for (const review of reviews) {
    console.log(`Moving review ${review.id} by ${review.telegramDisplayName}...`);
    console.log(`  Excerpt: ${review.reviewText.substring(0, 80)}...`);

    await prisma.review.update({
      where: { id: review.id },
      data: { bookId: toBookId },
    });

    console.log(`  ✓ Moved to book ${toBookId}`);
  }

  console.log();
  console.log("=".repeat(70));

  // Show final counts
  const fromCount = await prisma.review.count({ where: { bookId: fromBookId } });
  const toCount = await prisma.review.count({ where: { bookId: toBookId } });

  console.log("Summary:");
  console.log(`  Reviews moved: ${reviews.length}`);
  console.log(`  "${fromBook.title}" now has: ${fromCount} reviews`);
  console.log(`  "${toBook.title}" now has: ${toCount} reviews`);

  await prisma.$disconnect();
}

fixChurchillToAverin().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
