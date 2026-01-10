import { PrismaClient } from "@prisma/client";
import readline from "readline";
import { extractBookInfo } from "../src/services/llm.js";
import { findOrCreateBook, findOrCreateBookByISBN } from "../src/services/book.service.js";

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

interface ReviewIssue {
  type: "no_book" | "multiple_books" | "low_confidence" | "can_improve";
  reviewId: number;
  reviewText: string;
  currentBook?: { id: number; title: string; author: string | null; googleBooksId: string | null };
  extractedInfo?: Awaited<ReturnType<typeof extractBookInfo>>;
  improvementReason?: string;
}

async function findProblematicReviews(reprocessMode: boolean = false): Promise<ReviewIssue[]> {
  const issues: ReviewIssue[] = [];

  console.log("🔍 Scanning reviews for issues...\n");

  // Find reviews without books
  const reviewsWithoutBooks = await prisma.review.findMany({
    where: { bookId: null },
    select: {
      id: true,
      reviewText: true,
    },
  });

  for (const review of reviewsWithoutBooks) {
    issues.push({
      type: "no_book",
      reviewId: review.id,
      reviewText: review.reviewText,
    });
  }

  console.log(`Found ${reviewsWithoutBooks.length} reviews without books`);

  // Find reviews with books
  const limit = reprocessMode ? undefined : 100; // No limit in reprocess mode
  const reviewsWithBooks = await prisma.review.findMany({
    where: { bookId: { not: null } },
    include: {
      book: {
        select: { id: true, title: true, author: true, googleBooksId: true },
      },
    },
    take: limit,
  });

  console.log(`Analyzing ${reviewsWithBooks.length} reviews with books...\n`);

  let processed = 0;
  let rateLimitHit = false;

  for (const review of reviewsWithBooks) {
    processed++;
    if (processed % 10 === 0) {
      console.log(`  Progress: ${processed}/${reviewsWithBooks.length}...`);
    }

    try {
      const bookInfo = await extractBookInfo(review.reviewText);

      if (!bookInfo) continue;

      const hasAlternatives = bookInfo.alternativeBooks && bookInfo.alternativeBooks.length > 0;
      const isLowConfidence = bookInfo.confidence === "low";

      if (hasAlternatives) {
        issues.push({
          type: "multiple_books",
          reviewId: review.id,
          reviewText: review.reviewText,
          currentBook: review.book!,
          extractedInfo: bookInfo,
        });
      } else if (isLowConfidence) {
        issues.push({
          type: "low_confidence",
          reviewId: review.id,
          reviewText: review.reviewText,
          currentBook: review.book!,
          extractedInfo: bookInfo,
        });
      }

      // In reprocess mode, check if we can improve the book match
      if (reprocessMode && review.book && bookInfo) {
        const canImprove = await checkIfCanImprove(review.book, bookInfo);
        if (canImprove.canImprove) {
          issues.push({
            type: "can_improve",
            reviewId: review.id,
            reviewText: review.reviewText,
            currentBook: review.book,
            extractedInfo: bookInfo,
            improvementReason: canImprove.reason,
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
        console.error(`\n⚠️  Google Books rate limit hit at review ${processed}/${reviewsWithBooks.length}`);
        rateLimitHit = true;
        break; // Stop processing
      }
      console.error(`Error processing review ${review.id}:`, error);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (rateLimitHit) {
    console.log(`\n⚠️  Stopped early due to rate limit. Processed ${processed}/${reviewsWithBooks.length} reviews.`);
    console.log(`💡 To continue:`);
    console.log(`   1. Wait for rate limit to reset (usually 24 hours)`);
    console.log(`   2. Or set GOOGLE_BOOKS_DELAY_MS=500 in .env for slower processing`);
    console.log(`   3. Or use --can-improve filter to process smaller batches\n`);
  }

  console.log(`\nFound ${issues.length} total issues\n`);

  return issues;
}

/**
 * Check if we can improve the current book match with new extraction logic
 */
async function checkIfCanImprove(
  currentBook: { id: number; title: string; author: string | null; googleBooksId: string | null },
  newExtraction: Awaited<ReturnType<typeof extractBookInfo>>
): Promise<{ canImprove: boolean; reason?: string }> {
  if (!newExtraction) {
    return { canImprove: false };
  }

  // If current book has no Google Books data but new extraction might find it
  if (!currentBook.googleBooksId && (newExtraction.titleVariants?.length || newExtraction.authorVariants?.length)) {
    // Try the new cascading search
    const { searchBookWithFallbacks } = await import("../src/services/googlebooks.js");
    const googleBook = await searchBookWithFallbacks(
      newExtraction.title,
      newExtraction.author || undefined,
      newExtraction.titleVariants,
      newExtraction.authorVariants
    );

    if (googleBook) {
      return {
        canImprove: true,
        reason: "Can add Google Books metadata (cover, ISBN, description)",
      };
    }
  }

  // Check if extracted title/author differs significantly from current
  const titleDifferent = newExtraction.title.toLowerCase() !== currentBook.title.toLowerCase();
  const authorDifferent = newExtraction.author && currentBook.author &&
    newExtraction.author.toLowerCase() !== currentBook.author.toLowerCase();

  if (titleDifferent || authorDifferent) {
    return {
      canImprove: true,
      reason: "Extracted book differs from current",
    };
  }

  return { canImprove: false };
}

async function handleIssue(issue: ReviewIssue, autoImprove: boolean = false): Promise<boolean> {
  console.log("\n" + "=".repeat(80));
  console.log(`📝 Review ID: ${issue.reviewId}`);
  console.log(`📌 Issue Type: ${issue.type}`);
  console.log("\n📖 Review Text:");
  console.log(issue.reviewText.substring(0, 500) + (issue.reviewText.length > 500 ? "..." : ""));
  console.log();

  if (issue.currentBook) {
    console.log(`📚 Current Book: "${issue.currentBook.title}"${issue.currentBook.author ? ` by ${issue.currentBook.author}` : ""}`);
    if (!issue.currentBook.googleBooksId) {
      console.log(`   ⚠️  No Google Books metadata`);
    }
    console.log();
  }

  if (issue.improvementReason) {
    console.log(`💡 Improvement: ${issue.improvementReason}`);
    console.log();
  }

  if (issue.extractedInfo) {
    console.log(`🤖 Extracted Info:`);
    console.log(`   Primary: "${issue.extractedInfo.title}"${issue.extractedInfo.author ? ` by ${issue.extractedInfo.author}` : ""}`);
    console.log(`   Confidence: ${issue.extractedInfo.confidence}`);

    if (issue.extractedInfo.alternativeBooks && issue.extractedInfo.alternativeBooks.length > 0) {
      console.log(`   Alternatives:`);
      issue.extractedInfo.alternativeBooks.forEach((alt, i) => {
        console.log(`     ${i + 1}. "${alt.title}"${alt.author ? ` by ${alt.author}` : ""}`);
      });
    }
    console.log();
  }

  // Auto-improve mode for "can_improve" issues
  if (autoImprove && issue.type === "can_improve" && issue.extractedInfo) {
    console.log("🤖 Auto-improvement mode enabled. Updating book...");

    const { id } = await findOrCreateBook(
      issue.extractedInfo.title,
      issue.extractedInfo.author,
      issue.extractedInfo.titleVariants,
      issue.extractedInfo.authorVariants
    );

    await prisma.review.update({
      where: { id: issue.reviewId },
      data: { bookId: id },
    });

    const book = await prisma.book.findUnique({
      where: { id },
      select: { title: true, author: true, googleBooksId: true },
    });

    console.log(`✅ Auto-updated to: "${book?.title}"${book?.author ? ` by ${book.author}` : ""}`);
    if (book?.googleBooksId) {
      console.log(`   ✨ Now has Google Books metadata`);
    }

    return true;
  }

  console.log("Options:");
  console.log("  [k] Keep current book");
  console.log("  [p] Use primary extracted book (with new cascading search)");

  if (issue.extractedInfo?.alternativeBooks && issue.extractedInfo.alternativeBooks.length > 0) {
    issue.extractedInfo.alternativeBooks.forEach((_, i) => {
      console.log(`  [${i + 1}] Use alternative book #${i + 1}`);
    });
  }

  console.log("  [i] Enter ISBN manually");
  console.log("  [t] Enter title and author manually");
  console.log("  [s] Skip this review");
  console.log("  [q] Quit");

  const choice = await question("\nYour choice: ");

  switch (choice.toLowerCase()) {
    case "k":
      console.log("✅ Keeping current book");
      return true;

    case "p":
      if (!issue.extractedInfo) {
        console.log("❌ No extracted info available");
        return false;
      }
      {
        const { id } = await findOrCreateBook(
          issue.extractedInfo.title,
          issue.extractedInfo.author,
          issue.extractedInfo.titleVariants,
          issue.extractedInfo.authorVariants
        );
        await prisma.review.update({
          where: { id: issue.reviewId },
          data: { bookId: id },
        });
        console.log("✅ Updated to primary extracted book");
      }
      return true;

    case "i":
      {
        const isbn = await question("Enter ISBN: ");
        const result = await findOrCreateBookByISBN(isbn.trim());

        if (!result) {
          console.log("❌ Could not find book with this ISBN");
          return false;
        }

        await prisma.review.update({
          where: { id: issue.reviewId },
          data: { bookId: result.id },
        });

        const book = await prisma.book.findUnique({
          where: { id: result.id },
          select: { title: true, author: true },
        });

        console.log(`✅ Updated to book from ISBN: "${book?.title}"${book?.author ? ` by ${book.author}` : ""}`);
      }
      return true;

    case "t":
      {
        const title = await question("Enter book title: ");
        const author = await question("Enter author (or press Enter to skip): ");

        const { id } = await findOrCreateBook(
          title.trim(),
          author.trim() || null
        );

        await prisma.review.update({
          where: { id: issue.reviewId },
          data: { bookId: id },
        });

        console.log(`✅ Updated to manually entered book`);
      }
      return true;

    case "s":
      console.log("⏭️  Skipping");
      return true;

    case "q":
      console.log("👋 Quitting");
      return false;

    default:
      // Check if it's a number for alternative books
      const altIndex = parseInt(choice);
      if (
        !isNaN(altIndex) &&
        issue.extractedInfo?.alternativeBooks &&
        altIndex >= 1 &&
        altIndex <= issue.extractedInfo.alternativeBooks.length
      ) {
        const altBook = issue.extractedInfo.alternativeBooks[altIndex - 1];
        const { id } = await findOrCreateBook(altBook.title, altBook.author);

        await prisma.review.update({
          where: { id: issue.reviewId },
          data: { bookId: id },
        });

        console.log(`✅ Updated to alternative book #${altIndex}`);
        return true;
      }

      console.log("❌ Invalid choice");
      return false;
  }
}

async function main() {
  console.log("📚 Book Review Fixer & Reprocessor");
  console.log("===================================\n");

  const args = process.argv.slice(2);
  const reprocessMode = args.includes("--reprocess");
  const autoImprove = args.includes("--auto-improve");

  const filter = args.includes("--no-book")
    ? "no_book"
    : args.includes("--multiple")
    ? "multiple_books"
    : args.includes("--low-confidence")
    ? "low_confidence"
    : args.includes("--can-improve")
    ? "can_improve"
    : null;

  if (reprocessMode) {
    console.log("🔄 REPROCESS MODE: Re-extracting all reviews with new logic");
    if (autoImprove) {
      console.log("🤖 AUTO-IMPROVE MODE: Automatically updating improvable books\n");
    } else {
      console.log("👤 MANUAL MODE: You'll review each improvement\n");
    }
  }

  const issues = await findProblematicReviews(reprocessMode);

  const filteredIssues = filter ? issues.filter((i) => i.type === filter) : issues;

  console.log(`\n📋 Found ${filteredIssues.length} issues to review\n`);

  if (filteredIssues.length === 0) {
    console.log("✨ No issues found!");
    return;
  }

  // In auto-improve mode, show summary first
  if (autoImprove) {
    const improvableCount = filteredIssues.filter((i) => i.type === "can_improve").length;
    console.log(`📊 Summary:`);
    console.log(`   Total issues: ${filteredIssues.length}`);
    console.log(`   Auto-improvable: ${improvableCount}`);
    console.log(`   Requires manual review: ${filteredIssues.length - improvableCount}\n`);

    const confirm = await question("Continue with auto-improvement? [Y/n]: ");
    if (confirm.toLowerCase() === "n") {
      console.log("Aborted.");
      return;
    }
    console.log();
  }

  let processed = 0;
  let fixed = 0;
  let autoFixed = 0;

  for (const issue of filteredIssues) {
    const shouldContinue = await handleIssue(issue, autoImprove);
    processed++;

    if (!shouldContinue) {
      break;
    }

    if (autoImprove && issue.type === "can_improve") {
      autoFixed++;
    }

    fixed++;

    if (processed < filteredIssues.length) {
      if (autoImprove && issue.type === "can_improve") {
        // Auto-continue for auto-improved items
        continue;
      }

      const continueChoice = await question("\nContinue to next issue? [Y/n]: ");
      if (continueChoice.toLowerCase() === "n") {
        break;
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("\n✅ Summary:");
  console.log(`   Processed: ${processed}/${filteredIssues.length}`);
  console.log(`   Fixed: ${fixed}`);
  if (autoImprove) {
    console.log(`   Auto-improved: ${autoFixed}`);
  }
  console.log();
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
