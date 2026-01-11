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

  // Fetch enrichments ready for finalization
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: {
      status: {
        in: ["selected", "isbn_entered"],
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

      if (dryRun) {
        console.log(`  [DRY RUN] Would create/find book: "${bookData.title}"`);
        console.log(`  [DRY RUN] Would create review for user ${message.telegramUserId}`);
        reviewsCreated++;
        continue;
      }

      // Check for existing book by googleBooksId
      let book = await prisma.book.findUnique({
        where: { googleBooksId: bookData.googleBooksId },
      });

      if (book) {
        console.log(`  ✓ Reusing existing book (ID: ${book.id})`);
        booksReused++;
      } else {
        // Check for similar book by title/author
        const similarBook = await findSimilarBook(bookData.title, bookData.author);

        if (similarBook) {
          book = similarBook;
          console.log(`  ✓ Reusing similar book (ID: ${book.id})`);
          booksReused++;
        } else {
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
          booksCreated++;
        }
      }

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

  await prisma.$disconnect();
}
