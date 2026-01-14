import * as readline from "readline";
import { PrismaClient } from "@prisma/client";
import { searchBookByISBN } from "../../src/services/googlebooks.js";
import {
  green,
  yellow,
  red,
  blue,
  bold,
  dim,
  displaySeparator,
  displayProgress,
  displayCheckmark,
  question,
} from "./utils/cli.js";
import { generateGoodreadsUrl } from "./utils/goodreads.js";
import { validateISBN } from "./utils/validation.js";

interface BookResult {
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

export async function reviewEnrichments(filter?: string): Promise<void> {
  const prisma = new PrismaClient();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Staged Import: Review Enrichments");
  console.log(displaySeparator());
  console.log();

  // Build where clause based on filter
  const whereClause: any = {
    status: "needs_selection",
  };

  if (filter === "multiple") {
    whereClause.hasMultipleResults = true;
  } else if (filter === "none") {
    whereClause.hasNoResults = true;
  } else if (filter === "quality") {
    whereClause.OR = [{ missingCover: true }, { missingMetadata: true }];
  }

  // Fetch enrichments needing selection
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${enrichments.length} enrichments needing selection`);
  if (filter) {
    console.log(`Filter: ${filter}`);
  }
  console.log();

  if (enrichments.length === 0) {
    console.log("No enrichments to review!");
    rl.close();
    await prisma.$disconnect();
    return;
  }

  let currentIndex = 0;
  let reviewed = 0;
  let selected = 0;
  let isbnEntered = 0;
  let manualEntry = 0;
  let skipped = 0;
  let postponed = 0;

  while (currentIndex < enrichments.length) {
    const enrichment = enrichments[currentIndex];

    // Display enrichment for review
    console.clear();
    console.log(displaySeparator());
    console.log(bold(`${displayProgress(currentIndex + 1, enrichments.length)} Book Selection - Enrichment ID: ${enrichment.id}`));
    console.log(displaySeparator());
    console.log();

    console.log(dim("Search Query:"));
    console.log(`  "${enrichment.searchTitle}" by ${enrichment.searchAuthor || "Unknown"}`);
    console.log();

    // Parse results
    const results: BookResult[] = enrichment.googleBooksResults ? JSON.parse(enrichment.googleBooksResults) : [];

    if (enrichment.hasNoResults) {
      // No results case
      console.log(yellow("No Google Books results found."));
      console.log();
      console.log(bold("Options:"));
      console.log("  [i] Enter ISBN to search");
      console.log("  [m] Manual entry without ISBN (book not published)");
      console.log("  [s] Skip this book (no Book/Review created)");
      console.log("  [p] Postpone (review later)");
      console.log("  [q] Quit (progress saved)");
      console.log();

      const answer = await question(rl, "Your choice: ");
      const choice = answer.trim().toLowerCase();

      if (choice === "q") {
        console.log();
        console.log("Quitting... Progress has been saved.");
        break;
      } else if (choice === "i") {
        const isbnResult = await handleIsbnEntry(rl, prisma, enrichment);
        if (isbnResult) {
          isbnEntered++;
          reviewed++;
          currentIndex++;
        }
      } else if (choice === "m") {
        const manualResult = await handleManualEntry(rl, prisma, enrichment);
        if (manualResult) {
          manualEntry++;
          reviewed++;
          currentIndex++;
        }
      } else if (choice === "s") {
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: { status: "skipped" },
        });
        skipped++;
        reviewed++;
        console.log(yellow("⊘ Skipped"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else if (choice === "p") {
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: { createdAt: new Date() },
        });
        postponed++;
        console.log(blue("⏭ Postponed"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else {
        console.log(red("Invalid choice"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else if (enrichment.hasMultipleResults || enrichment.missingCover || enrichment.missingMetadata) {
      // Multiple results or quality issues
      console.log(`Found ${results.length} Google Books result${results.length > 1 ? "s" : ""}:`);
      console.log();

      // Display each result
      results.forEach((result, index) => {
        console.log(bold(`[${index + 1}] ${result.title}`));
        console.log(`    Author: ${result.author || "N/A"}`);

        const details = [];
        if (result.publicationYear) details.push(`Year: ${result.publicationYear}`);
        if (result.isbn) details.push(`ISBN: ${result.isbn}`);
        if (result.pageCount) details.push(`Pages: ${result.pageCount}`);
        console.log(`    ${details.join(" | ")}`);

        const metadata = [];
        metadata.push(`Cover: ${displayCheckmark(!!result.coverUrl)}`);
        metadata.push(`Description: ${displayCheckmark(!!result.description)}`);
        if (result.genres && result.genres.length > 0) {
          metadata.push(`Genres: ${result.genres.join(", ")}`);
        } else {
          metadata.push(`Genres: N/A`);
        }
        console.log(`    ${metadata.join(" | ")}`);

        const goodreadsUrl = generateGoodreadsUrl(result.isbn, result.title, result.author);
        console.log(dim(`    Goodreads: ${goodreadsUrl}`));
        console.log();
      });

      // Show quality warning if applicable
      if (results.length === 1) {
        const result = results[0];
        if (!result.coverUrl || !result.description || !result.genres?.length || !result.pageCount || !result.publicationYear) {
          console.log(yellow("⚠️  Quality Issue:"));
          const issues = [];
          if (!result.coverUrl) issues.push("No cover image");
          if (!result.description) issues.push("No description");
          if (!result.genres || result.genres.length === 0) issues.push("No genres");
          if (!result.pageCount) issues.push("No page count");
          if (!result.publicationYear) issues.push("No publication year");
          console.log(yellow(`    ${issues.join(", ")}`));
          console.log();
        }
      }

      console.log(bold("Options:"));
      if (results.length > 1) {
        console.log(`  [1-${results.length}] Select book #N`);
      } else {
        console.log("  [a] Accept this book");
      }
      console.log("  [i] Enter different ISBN");
      console.log("  [m] Manual entry without ISBN (book not published)");
      console.log("  [s] Skip this book");
      console.log("  [p] Postpone (review later)");
      console.log("  [q] Quit (progress saved)");
      console.log();

      const answer = await question(rl, "Your choice: ");
      const choice = answer.trim().toLowerCase();

      if (choice === "q") {
        console.log();
        console.log("Quitting... Progress has been saved.");
        break;
      } else if (choice === "a" && results.length === 1) {
        // Accept single result
        const result = results[0];
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: {
            status: "selected",
            selectedGoogleBooksId: result.googleBooksId,
            selectedBookData: JSON.stringify(result),
          },
        });
        selected++;
        reviewed++;
        console.log(green("✓ Selected"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else if (/^\d+$/.test(choice)) {
        // Select specific result
        const resultIndex = parseInt(choice, 10) - 1;
        if (resultIndex >= 0 && resultIndex < results.length) {
          const result = results[resultIndex];
          await prisma.stagedEnrichment.update({
            where: { id: enrichment.id },
            data: {
              status: "selected",
              selectedGoogleBooksId: result.googleBooksId,
              selectedBookData: JSON.stringify(result),
            },
          });
          selected++;
          reviewed++;
          console.log(green(`✓ Selected #${resultIndex + 1}`));
          await new Promise((resolve) => setTimeout(resolve, 500));
          currentIndex++;
        } else {
          console.log(red("Invalid selection number"));
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else if (choice === "i") {
        const isbnResult = await handleIsbnEntry(rl, prisma, enrichment);
        if (isbnResult) {
          isbnEntered++;
          reviewed++;
          currentIndex++;
        }
      } else if (choice === "m") {
        const manualResult = await handleManualEntry(rl, prisma, enrichment);
        if (manualResult) {
          manualEntry++;
          reviewed++;
          currentIndex++;
        }
      } else if (choice === "s") {
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: { status: "skipped" },
        });
        skipped++;
        reviewed++;
        console.log(yellow("⊘ Skipped"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else if (choice === "p") {
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: { createdAt: new Date() },
        });
        postponed++;
        console.log(blue("⏭ Postponed"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else {
        console.log(red("Invalid choice"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      // This shouldn't happen if filtering is correct
      console.log(yellow("Unexpected enrichment state, skipping..."));
      currentIndex++;
    }
  }

  rl.close();

  console.log();
  console.log(displaySeparator());
  console.log("Review complete!");
  console.log(`  Reviewed: ${reviewed}`);
  console.log(`  Selected: ${selected}`);
  console.log(`  ISBN entered: ${isbnEntered}`);
  console.log(`  Manual entry: ${manualEntry}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Postponed: ${postponed}`);

  await prisma.$disconnect();
}

async function handleManualEntry(
  rl: readline.Interface,
  prisma: PrismaClient,
  enrichment: any
): Promise<boolean> {
  console.log();
  console.log(yellow("Manual book entry (for unpublished books without ISBN)"));
  console.log();
  console.log(dim("Original search:"));
  console.log(`  Title: "${enrichment.searchTitle}"`);
  console.log(`  Author: ${enrichment.searchAuthor || "Unknown"}`);
  console.log();

  // Ask for title
  const titleInput = await question(
    rl,
    `Enter book title (or press Enter to use "${enrichment.searchTitle}"): `
  );
  const finalTitle = titleInput.trim() || enrichment.searchTitle;

  // Ask for author
  const authorInput = await question(
    rl,
    `Enter author name (or press Enter to use "${enrichment.searchAuthor || "Unknown"}"): `
  );
  const finalAuthor = authorInput.trim() || enrichment.searchAuthor || null;

  // Confirm
  console.log();
  console.log("Book to be saved:");
  console.log(green(`  Title: "${finalTitle}"`));
  console.log(green(`  Author: ${finalAuthor || "Unknown"}`));
  console.log(yellow(`  Note: No ISBN, no Google Books data`));
  console.log();

  const confirm = await question(rl, "[a] Accept and save, [c] Cancel: ");
  const confirmChoice = confirm.trim().toLowerCase();

  if (confirmChoice === "a") {
    // Create minimal book result without Google Books data
    // Use a unique identifier for manual entries to prevent them from merging
    const manualBookData: BookResult = {
      title: finalTitle,
      author: finalAuthor,
      googleBooksId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique ID for manual entries
      googleBooksUrl: null,
      coverUrl: null,
      genres: [],
      publicationYear: null,
      description: null,
      isbn: null,
      pageCount: null,
    };

    await prisma.stagedEnrichment.update({
      where: { id: enrichment.id },
      data: {
        status: "manual_entry",
        selectedGoogleBooksId: null,
        selectedBookData: JSON.stringify(manualBookData),
        enteredIsbn: null,
      },
    });
    console.log(green("✓ Book saved manually (no ISBN)"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  }

  return false;
}

async function handleIsbnEntry(
  rl: readline.Interface,
  prisma: PrismaClient,
  enrichment: any
): Promise<boolean> {
  while (true) {
    console.log();
    const isbnInput = await question(rl, "Enter ISBN (10 or 13 digits, or 'c' to cancel): ");

    if (isbnInput.trim().toLowerCase() === "c") {
      return false;
    }

    const validIsbn = validateISBN(isbnInput);
    if (!validIsbn) {
      console.log(red("Invalid ISBN format. Please enter 10 or 13 digits."));
      continue;
    }

    console.log();
    console.log("Searching Google Books by ISBN...");

    try {
      const result = await searchBookByISBN(validIsbn);

      if (!result) {
        console.log(red(`No book found for ISBN: ${validIsbn}`));
        console.log();
        const retry = await question(rl, "[i] Try different ISBN, [c] Cancel: ");
        if (retry.trim().toLowerCase() === "c") {
          return false;
        }
        continue;
      }

      // Display found book
      console.log();
      console.log(green(`Found: "${result.title}" by ${result.author || "Unknown"}`));
      console.log(`  Year: ${result.publicationYear || "N/A"} | Pages: ${result.pageCount || "N/A"}`);
      console.log(`  Cover: ${displayCheckmark(!!result.coverUrl)} | Description: ${displayCheckmark(!!result.description)}`);
      console.log(`  Genres: ${result.genres && result.genres.length > 0 ? result.genres.join(", ") : "N/A"}`);

      const goodreadsUrl = generateGoodreadsUrl(result.isbn, result.title, result.author);
      console.log(dim(`  Goodreads: ${goodreadsUrl}`));
      console.log();

      const confirm = await question(rl, "[a] Accept this book, [i] Try different ISBN, [c] Cancel: ");
      const confirmChoice = confirm.trim().toLowerCase();

      if (confirmChoice === "a") {
        await prisma.stagedEnrichment.update({
          where: { id: enrichment.id },
          data: {
            status: "isbn_entered",
            selectedGoogleBooksId: result.googleBooksId,
            selectedBookData: JSON.stringify(result),
            enteredIsbn: validIsbn,
          },
        });
        console.log(green("✓ Book saved via ISBN"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        return true;
      } else if (confirmChoice === "c") {
        return false;
      }
      // If 'i', loop continues
    } catch (error) {
      console.log(red(`Error searching ISBN: ${error}`));
      console.log();
      const retry = await question(rl, "[i] Try different ISBN, [c] Cancel: ");
      if (retry.trim().toLowerCase() === "c") {
        return false;
      }
    }
  }
}
