import * as readline from "readline";
import { PrismaClient } from "@prisma/client";
import {
  green,
  yellow,
  red,
  bold,
  dim,
  displaySeparator,
  displayProgress,
  colorConfidence,
  question,
  truncateText,
} from "./utils/cli.js";

export async function reviewExtractions(filter?: string): Promise<void> {
  const prisma = new PrismaClient();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Staged Import: Review Extractions");
  console.log(displaySeparator());
  console.log();

  // Build where clause based on filter
  const whereClause: any = {
    status: "needs_review",
  };

  if (filter === "low") {
    whereClause.confidence = "low";
  } else if (filter === "medium") {
    whereClause.confidence = "medium";
  } else if (filter === "alternatives") {
    whereClause.alternativeBooks = { not: null };
  }

  // Fetch extractions needing review
  const extractions = await prisma.stagedExtraction.findMany({
    where: whereClause,
    include: {
      stagedMessage: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${extractions.length} extractions needing review`);
  if (filter) {
    console.log(`Filter: ${filter}`);
  }
  console.log();

  if (extractions.length === 0) {
    console.log("No extractions to review!");
    rl.close();
    await prisma.$disconnect();
    return;
  }

  let currentIndex = 0;
  let reviewed = 0;
  let confirmed = 0;
  let edited = 0;
  let skipped = 0;

  while (currentIndex < extractions.length) {
    const extraction = extractions[currentIndex];
    const message = extraction.stagedMessage;

    if (!message) {
      console.error(`Error: No message found for extraction ${extraction.id}`);
      currentIndex++;
      continue;
    }

    // Display extraction for review
    console.clear();
    console.log(displaySeparator());
    console.log(bold(`${displayProgress(currentIndex + 1, extractions.length)} Extraction Review - ID: ${extraction.id}`));
    console.log(displaySeparator());
    console.log();

    console.log(dim("Review Text:"));
    console.log(`  ${message.reviewText}`);
    console.log();

    console.log(bold("Extracted Info:"));

    // Highlight manual review cases
    if (extraction.title === "[Manual review required]") {
      console.log(red(`  ⚠️  ${extraction.title}`));
      if (extraction.additionalContext) {
        console.log(dim(`      Reason: ${extraction.additionalContext}`));
      }
    } else {
      console.log(`  Primary:    "${extraction.title}" by ${extraction.author || "Unknown"}`);
    }

    console.log(`  Confidence: ${colorConfidence(extraction.confidence)}`);

    if (extraction.additionalContext && extraction.title !== "[Manual review required]") {
      console.log(dim(`  Context: ${extraction.additionalContext}`));
    }

    if (extraction.titleVariants) {
      const variants = JSON.parse(extraction.titleVariants);
      if (variants.length > 0) {
        console.log(dim(`  Title variants: ${variants.join(", ")}`));
      }
    }

    if (extraction.authorVariants) {
      const variants = JSON.parse(extraction.authorVariants);
      if (variants.length > 0) {
        console.log(dim(`  Author variants: ${variants.join(", ")}`));
      }
    }

    if (extraction.alternativeBooks) {
      const alternatives = JSON.parse(extraction.alternativeBooks);
      if (alternatives.length > 0) {
        console.log();
        console.log(yellow("  Alternative Books:"));
        alternatives.forEach((alt: { title: string; author: string | null }, index: number) => {
          console.log(`    ${index + 1}. "${alt.title}" by ${alt.author || "Unknown"}`);
        });
      }
    }

    console.log();
    console.log(bold("Options:"));

    // Don't allow confirming manual review cases directly
    if (extraction.title === "[Manual review required]") {
      console.log(dim("  [c] Confirm primary extraction (not available - must edit)"));
      console.log("  [e] Edit title and author manually (required)");
    } else {
      console.log("  [c] Confirm primary extraction");
      console.log("  [e] Edit title and author manually");
    }

    if (extraction.alternativeBooks) {
      const alternatives = JSON.parse(extraction.alternativeBooks);
      if (alternatives.length > 0) {
        console.log(`  [1-${alternatives.length}] Use alternative book #N`);
      }
    }

    console.log("  [s] Skip this review");
    console.log("  [q] Quit (progress saved)");
    console.log();

    const answer = await question(rl, "Your choice: ");
    const choice = answer.trim().toLowerCase();

    if (choice === "q") {
      console.log();
      console.log("Quitting... Progress has been saved.");
      break;
    } else if (choice === "c") {
      // Confirm primary extraction (not allowed for manual review cases)
      if (extraction.title === "[Manual review required]") {
        console.log(red("Cannot confirm - must edit to provide title and author"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        await prisma.stagedExtraction.update({
          where: { id: extraction.id },
          data: { status: "confirmed" },
        });
        confirmed++;
        reviewed++;
        console.log(green("✓ Confirmed"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      }
    } else if (choice === "e") {
      // Edit title and author
      console.log();
      console.log(dim("Enter new values or press Enter to keep existing:"));
      const currentTitle = extraction.title === "[Manual review required]" ? "" : extraction.title;
      const currentAuthor = extraction.author || "";

      const newTitle = await question(rl, `Title [${currentTitle || "required"}]: `);
      const newAuthor = await question(rl, `Author [${currentAuthor || "optional"}]: `);

      const finalTitle = newTitle.trim() || currentTitle;
      const finalAuthor = newAuthor.trim() || currentAuthor || null;

      if (!finalTitle) {
        console.log(red("Title is required!"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      await prisma.stagedExtraction.update({
        where: { id: extraction.id },
        data: {
          status: "edited",
          confirmedTitle: finalTitle,
          confirmedAuthor: finalAuthor,
        },
      });
      edited++;
      reviewed++;
      console.log(green(`✓ Edited: "${finalTitle}" by ${finalAuthor || "Unknown"}`));
      await new Promise((resolve) => setTimeout(resolve, 800));
      currentIndex++;
    } else if (choice === "s") {
      // Skip this review
      await prisma.stagedExtraction.update({
        where: { id: extraction.id },
        data: { status: "skipped" },
      });
      skipped++;
      reviewed++;
      console.log(yellow("⊘ Skipped"));
      await new Promise((resolve) => setTimeout(resolve, 500));
      currentIndex++;
    } else if (extraction.alternativeBooks && /^\d+$/.test(choice)) {
      // Use alternative book
      const alternatives = JSON.parse(extraction.alternativeBooks);
      const altIndex = parseInt(choice, 10) - 1;

      if (altIndex >= 0 && altIndex < alternatives.length) {
        const alt = alternatives[altIndex];
        await prisma.stagedExtraction.update({
          where: { id: extraction.id },
          data: {
            status: "edited",
            confirmedTitle: alt.title,
            confirmedAuthor: alt.author,
          },
        });
        edited++;
        reviewed++;
        console.log(green(`✓ Using alternative #${altIndex + 1}`));
        await new Promise((resolve) => setTimeout(resolve, 500));
        currentIndex++;
      } else {
        console.log(red("Invalid alternative number"));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      console.log(red("Invalid choice"));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  rl.close();

  console.log();
  console.log(displaySeparator());
  console.log("Review complete!");
  console.log(`  Reviewed: ${reviewed}`);
  console.log(`  Confirmed: ${confirmed}`);
  console.log(`  Edited: ${edited}`);
  console.log(`  Skipped: ${skipped}`);

  await prisma.$disconnect();
}
