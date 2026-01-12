import { PrismaClient } from "@prisma/client";
import { findSimilarBook } from "../../src/services/book.service.js";
import { analyzeSentiment } from "../../src/services/sentiment.js";

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

export async function finalize(dryRun?: boolean): Promise<void> {
  const prisma = new PrismaClient();

  console.log("Staged Import: Finalize Stage");
  console.log("=".repeat(70));
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log();

  // Track books in this import session to detect duplicates within the import
  const bookCache = new Map<string, { id: number; title: string }>();

  // Fetch enrichments ready for finalization
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: {
      status: {
        in: ["selected", "isbn_entered", "manual_entry"],
      },
      bookId: null, // Not yet finalized
    },
    include: {
      stagedExtraction: {
        include: {
          stagedMessage: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${enrichments.length} enrichments to finalize`);
  console.log();

  if (enrichments.length === 0) {
    console.log("No enrichments to finalize!");
    await prisma.$disconnect();
    return;
  }

  let booksCreated = 0;
  let booksReused = 0;
  let reviewsCreated = 0;
  let errors = 0;
  const bookReviewCounts = new Map<number, { title: string; count: number }>();

  for (const enrichment of enrichments) {
    try {
      if (!enrichment.selectedBookData) {
        console.error(`Error: No book data for enrichment ${enrichment.id}`);
        errors++;
        continue;
      }

      if (!enrichment.stagedExtraction?.stagedMessage) {
        console.error(`Error: No message data for enrichment ${enrichment.id}`);
        errors++;
        continue;
      }

      const bookData: BookData = JSON.parse(enrichment.selectedBookData);
      const message = enrichment.stagedExtraction.stagedMessage;

      console.log(`[${reviewsCreated + 1}/${enrichments.length}] Finalizing "${bookData.title}" by ${bookData.author || "Unknown"}...`);

      let book: { id: number; title: string; author: string | null } | null = null;
      let cacheKey = bookData.googleBooksId;

      // DRY RUN: Simulate book lookup
      if (dryRun) {
        let dryRunBookId: number;

        // Check if we've seen this book in the dry run
        if (bookCache.has(cacheKey)) {
          const cached = bookCache.get(cacheKey)!;
          dryRunBookId = cached.id;
          console.log(`  [DRY RUN] Would reuse from import session`);
          booksReused++;
        } else {
          // Check if book exists in DB (only if googleBooksId is not empty)
          let existingBook = null;
          if (bookData.googleBooksId && bookData.googleBooksId.trim() !== "") {
            existingBook = await prisma.book.findUnique({
              where: { googleBooksId: bookData.googleBooksId },
            });
          }

          if (existingBook) {
            dryRunBookId = existingBook.id;
            console.log(`  [DRY RUN] Would reuse existing book (ID: ${existingBook.id})`);
            bookCache.set(cacheKey, { id: existingBook.id, title: existingBook.title });
            booksReused++;
          } else {
            // Check for similar book
            const similarBook = await findSimilarBook(bookData.title, bookData.author);
            if (similarBook) {
              dryRunBookId = similarBook.id;
              console.log(`  [DRY RUN] Would reuse similar book (ID: ${similarBook.id})`);
              bookCache.set(cacheKey, { id: similarBook.id, title: similarBook.title });
              booksReused++;
            } else {
              dryRunBookId = -(booksCreated + 1); // Negative IDs for dry run
              console.log(`  [DRY RUN] Would create new book`);
              bookCache.set(cacheKey, { id: dryRunBookId, title: bookData.title });
              booksCreated++;
            }
          }
        }

        // Track review counts for dry run
        if (!bookReviewCounts.has(dryRunBookId)) {
          bookReviewCounts.set(dryRunBookId, { title: bookData.title, count: 0 });
        }
        bookReviewCounts.get(dryRunBookId)!.count++;

        console.log(`  [DRY RUN] Would create review for user ${message.telegramUserId}`);
        reviewsCreated++;
        continue;
      }

      // Check import session cache first (for duplicates within this import)
      if (bookCache.has(cacheKey)) {
        const cached = bookCache.get(cacheKey)!;
        book = await prisma.book.findUnique({ where: { id: cached.id } });
        if (book) {
          console.log(`  ✓ Reusing from import session (ID: ${book.id})`);
          booksReused++;
        }
      }

      if (!book) {
        // Check for existing book by googleBooksId (only if it's not empty)
        if (bookData.googleBooksId && bookData.googleBooksId.trim() !== "") {
          book = await prisma.book.findUnique({
            where: { googleBooksId: bookData.googleBooksId },
          });

          if (book) {
            console.log(`  ✓ Reusing existing book (ID: ${book.id})`);
            bookCache.set(cacheKey, { id: book.id, title: book.title });
            booksReused++;
          }
        }
      }

      if (!book) {
        // Check for similar book by title/author
        const similarBook = await findSimilarBook(bookData.title, bookData.author);

        if (similarBook) {
          book = similarBook;
          console.log(`  ✓ Reusing similar book (ID: ${book.id})`);
          bookCache.set(cacheKey, { id: book.id, title: book.title });
          booksReused++;
        }
      }

      if (!book) {
        // Create new book
        book = await prisma.book.create({
          data: {
            title: bookData.title,
            author: bookData.author,
            googleBooksId: bookData.googleBooksId,
            googleBooksUrl: bookData.googleBooksUrl,
            coverUrl: bookData.coverUrl,
            genres: bookData.genres && bookData.genres.length > 0 ? JSON.stringify(bookData.genres) : null,
            publicationYear: bookData.publicationYear,
            description: bookData.description,
            isbn: bookData.isbn,
            pageCount: bookData.pageCount,
          },
        });
        console.log(`  ✓ Created new book (ID: ${book.id})`);
        bookCache.set(cacheKey, { id: book.id, title: book.title });
        booksCreated++;
      }

      // Track book review counts
      if (!bookReviewCounts.has(book.id)) {
        bookReviewCounts.set(book.id, { title: book.title, count: 0 });
      }
      const bookStats = bookReviewCounts.get(book.id)!;
      bookStats.count++;

      // Analyze sentiment
      const sentiment = await analyzeSentiment(message.reviewText);

      // Create review
      await prisma.review.create({
        data: {
          bookId: book.id,
          telegramUserId: message.telegramUserId,
          telegramDisplayName: message.displayName,
          reviewText: message.reviewText,
          sentiment,
          messageId: message.messageId,
          chatId: message.chatId,
          reviewedAt: message.reviewedAt,
        },
      });
      console.log(`  ✓ Created review (sentiment: ${sentiment})`);
      reviewsCreated++;

      // Update enrichment with bookId
      await prisma.stagedEnrichment.update({
        where: { id: enrichment.id },
        data: { bookId: book.id },
      });
    } catch (error) {
      console.error(`  ✗ Error finalizing enrichment ${enrichment.id}:`, error);
      errors++;
    }
  }

  console.log();
  console.log("Finalize complete!");
  console.log(`  Books created: ${booksCreated}`);
  console.log(`  Books reused: ${booksReused}`);
  console.log(`  Reviews created: ${reviewsCreated}`);
  console.log(`  Errors: ${errors}`);
  console.log();

  // Show books with multiple reviews
  const booksWithMultipleReviews = Array.from(bookReviewCounts.entries())
    .filter(([_, stats]) => stats.count > 1)
    .sort((a, b) => b[1].count - a[1].count);

  if (booksWithMultipleReviews.length > 0) {
    console.log("Books with multiple reviews in this import:");
    for (const [bookId, stats] of booksWithMultipleReviews) {
      console.log(`  "${stats.title}" - ${stats.count} reviews (Book ID: ${bookId})`);
    }
    console.log();
    console.log(`Total unique books: ${bookReviewCounts.size}`);
    console.log(`Books with 2+ reviews: ${booksWithMultipleReviews.length}`);
  }

  await prisma.$disconnect();
}
