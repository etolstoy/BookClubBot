#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

interface BookData {
  title: string;
  author: string | null;
  googleBooksId: string;
  googleBooksUrl: string | null;
  coverUrl: string | null;
  genres: string[];
  publicationYear: number | null;
  description: string | null;
  isbn: string | null;
  pageCount: number | null;
}

async function fixBook577() {
  const prisma = new PrismaClient();

  console.log("Fixing misassigned reviews for Book 577");
  console.log("=".repeat(70));
  console.log();

  // Get all reviews for book 577
  const reviews = await prisma.review.findMany({
    where: { bookId: 577 },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${reviews.length} reviews assigned to Book 577`);
  console.log();

  let fixed = 0;
  let errors = 0;
  const bookMap = new Map<string, number>(); // title+author -> bookId

  for (const review of reviews) {
    try {
      console.log(`\nProcessing review ${review.id} by ${review.telegramDisplayName}...`);
      console.log(`  Message ID: ${review.messageId}`);

      if (!review.messageId) {
        console.log(`  ⚠ No messageId, skipping`);
        continue;
      }

      // Find the staged message
      const stagedMessage = await prisma.stagedMessage.findFirst({
        where: { messageId: review.messageId },
        include: {
          extraction: {
            include: {
              enrichment: true,
            },
          },
        },
      });

      if (!stagedMessage) {
        console.log(`  ⚠ No staged message found, skipping`);
        continue;
      }

      if (!stagedMessage.extraction?.enrichment) {
        console.log(`  ⚠ No enrichment data found, skipping`);
        continue;
      }

      const enrichment = stagedMessage.extraction.enrichment;

      if (!enrichment.selectedBookData) {
        console.log(`  ⚠ No book data in enrichment, skipping`);
        continue;
      }

      const bookData: BookData = JSON.parse(enrichment.selectedBookData);
      console.log(`  Book: "${bookData.title}" by ${bookData.author || "Unknown"}`);

      // Check if this is the correct book (Слово пацана)
      if (bookData.title === "Слово пацана. Криминальный Татарстан 1970-2010х" && bookData.author === "Роберт Гараев") {
        console.log(`  ✓ Already correctly assigned to Book 577`);
        continue;
      }

      // Check if we already created a book for this title+author
      const mapKey = `${bookData.title}|||${bookData.author || ""}`;
      let correctBookId = bookMap.get(mapKey);

      if (!correctBookId) {
        // Look for existing book with same title and author
        const existingBook = await prisma.book.findFirst({
          where: {
            title: bookData.title,
            author: bookData.author,
          },
        });

        if (existingBook) {
          console.log(`  ✓ Found existing book (ID: ${existingBook.id})`);
          correctBookId = existingBook.id;
        } else {
          // Create new book
          const newBook = await prisma.book.create({
            data: {
              title: bookData.title,
              author: bookData.author,
              googleBooksId: bookData.googleBooksId && bookData.googleBooksId.trim() !== "" ? bookData.googleBooksId : null,
              googleBooksUrl: bookData.googleBooksUrl,
              coverUrl: bookData.coverUrl,
              genres: bookData.genres && bookData.genres.length > 0 ? JSON.stringify(bookData.genres) : null,
              publicationYear: bookData.publicationYear,
              description: bookData.description,
              isbn: bookData.isbn,
              pageCount: bookData.pageCount,
            },
          });
          console.log(`  ✓ Created new book (ID: ${newBook.id})`);
          correctBookId = newBook.id;
        }

        bookMap.set(mapKey, correctBookId);
      } else {
        console.log(`  ✓ Using previously mapped book (ID: ${correctBookId})`);
      }

      // Update the review
      await prisma.review.update({
        where: { id: review.id },
        data: { bookId: correctBookId },
      });

      // Update the enrichment
      await prisma.stagedEnrichment.update({
        where: { id: enrichment.id },
        data: { bookId: correctBookId },
      });

      console.log(`  ✓ Moved review to book ${correctBookId}`);
      fixed++;
    } catch (error) {
      console.error(`  ✗ Error processing review ${review.id}:`, error);
      errors++;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Summary:");
  console.log(`  Total reviews processed: ${reviews.length}`);
  console.log(`  Reviews fixed: ${fixed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Unique books created/found: ${bookMap.size}`);
  console.log();

  // Show final review count for book 577
  const remainingReviews = await prisma.review.count({
    where: { bookId: 577 },
  });
  console.log(`Reviews remaining on Book 577: ${remainingReviews}`);

  await prisma.$disconnect();
}

fixBook577().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
