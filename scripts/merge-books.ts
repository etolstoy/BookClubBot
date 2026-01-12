#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

interface Book {
  id: number;
  title: string;
  author: string | null;
  googleBooksId: string | null;
}

async function findBookByTitle(prisma: PrismaClient, searchTitle: string): Promise<Book[]> {
  // Try exact match first
  let books = await prisma.book.findMany({
    where: { title: searchTitle },
    select: { id: true, title: true, author: true, googleBooksId: true },
  });

  // If no exact match, try partial match
  if (books.length === 0) {
    books = await prisma.book.findMany({
      where: {
        title: {
          contains: searchTitle,
        },
      },
      select: { id: true, title: true, author: true, googleBooksId: true },
    });
  }

  return books;
}

async function mergeBooks() {
  const prisma = new PrismaClient();

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npm run merge-books -- "Source Book Title" "Target Book Title"

This script will:
1. Find both books by title
2. Move all reviews from source book to target book
3. Update staged enrichments
4. Delete the source book

Examples:
  npm run merge-books -- "Babel: Or the Necessity" "Вавилон"
  npm run merge-books -- "Wrong Title" "Correct Title"
`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const sourceTitle = args[0];
  const targetTitle = args[1];

  console.log("Book Merge Script");
  console.log("=".repeat(70));
  console.log();

  // Find source book
  console.log(`Searching for source book: "${sourceTitle}"...`);
  const sourceBooks = await findBookByTitle(prisma, sourceTitle);

  if (sourceBooks.length === 0) {
    console.error(`❌ No books found matching: "${sourceTitle}"`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (sourceBooks.length > 1) {
    console.error(`❌ Multiple books found matching: "${sourceTitle}"`);
    console.log("\nPlease be more specific. Found:");
    sourceBooks.forEach((book, i) => {
      console.log(`  ${i + 1}. [${book.id}] "${book.title}" by ${book.author || "Unknown"}`);
    });
    await prisma.$disconnect();
    process.exit(1);
  }

  const sourceBook = sourceBooks[0];
  console.log(`✓ Found source: [${sourceBook.id}] "${sourceBook.title}" by ${sourceBook.author || "Unknown"}`);
  console.log();

  // Find target book
  console.log(`Searching for target book: "${targetTitle}"...`);
  const targetBooks = await findBookByTitle(prisma, targetTitle);

  if (targetBooks.length === 0) {
    console.error(`❌ No books found matching: "${targetTitle}"`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (targetBooks.length > 1) {
    console.error(`❌ Multiple books found matching: "${targetTitle}"`);
    console.log("\nPlease be more specific. Found:");
    targetBooks.forEach((book, i) => {
      console.log(`  ${i + 1}. [${book.id}] "${book.title}" by ${book.author || "Unknown"}`);
    });
    await prisma.$disconnect();
    process.exit(1);
  }

  const targetBook = targetBooks[0];
  console.log(`✓ Found target: [${targetBook.id}] "${targetBook.title}" by ${targetBook.author || "Unknown"}`);
  console.log();

  // Safety check - can't merge a book with itself
  if (sourceBook.id === targetBook.id) {
    console.error("❌ Source and target books are the same! Cannot merge a book with itself.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Count reviews to move
  const reviewCount = await prisma.review.count({ where: { bookId: sourceBook.id } });
  const targetReviewCount = await prisma.review.count({ where: { bookId: targetBook.id } });

  console.log("=".repeat(70));
  console.log("Merge Plan:");
  console.log(`  Source: [${sourceBook.id}] "${sourceBook.title}"`);
  console.log(`          Reviews to move: ${reviewCount}`);
  console.log();
  console.log(`  Target: [${targetBook.id}] "${targetBook.title}"`);
  console.log(`          Current reviews: ${targetReviewCount}`);
  console.log(`          After merge: ${targetReviewCount + reviewCount}`);
  console.log();
  console.log(`  Action: Delete source book after moving reviews`);
  console.log("=".repeat(70));
  console.log();

  if (reviewCount === 0) {
    console.log("⚠ Source book has no reviews. Will just delete the book.");
  }

  // Get reviews to move
  const reviews = await prisma.review.findMany({
    where: { bookId: sourceBook.id },
    orderBy: { id: "asc" },
  });

  // Move reviews
  if (reviews.length > 0) {
    console.log(`Moving ${reviews.length} review(s)...`);
    for (const review of reviews) {
      console.log(`  [${review.id}] ${review.telegramDisplayName || "Unknown"}: ${review.reviewText.substring(0, 60).replace(/\n/g, ' ')}...`);

      await prisma.review.update({
        where: { id: review.id },
        data: { bookId: targetBook.id },
      });
    }
    console.log(`✓ Moved ${reviews.length} review(s)`);
    console.log();
  }

  // Update staged enrichments
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: { bookId: sourceBook.id },
  });

  if (enrichments.length > 0) {
    console.log(`Updating ${enrichments.length} staged enrichment(s)...`);
    for (const enrichment of enrichments) {
      await prisma.stagedEnrichment.update({
        where: { id: enrichment.id },
        data: { bookId: targetBook.id },
      });
    }
    console.log(`✓ Updated ${enrichments.length} staged enrichment(s)`);
    console.log();
  }

  // Delete source book
  console.log(`Deleting source book [${sourceBook.id}] "${sourceBook.title}"...`);
  await prisma.book.delete({
    where: { id: sourceBook.id },
  });
  console.log(`✓ Deleted source book`);
  console.log();

  // Final summary
  const finalReviewCount = await prisma.review.count({ where: { bookId: targetBook.id } });

  console.log("=".repeat(70));
  console.log("✅ Merge Complete!");
  console.log(`  Reviews moved: ${reviews.length}`);
  console.log(`  Enrichments updated: ${enrichments.length}`);
  console.log(`  Source book deleted: "${sourceBook.title}"`);
  console.log(`  Target book "${targetBook.title}" now has ${finalReviewCount} review(s)`);
  console.log("=".repeat(70));

  await prisma.$disconnect();
}

mergeBooks().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
