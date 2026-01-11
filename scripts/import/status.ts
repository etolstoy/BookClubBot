import { PrismaClient } from "@prisma/client";
import { green, yellow, dim, bold, displaySeparator } from "./utils/cli.js";

export async function status(): Promise<void> {
  const prisma = new PrismaClient();

  console.log(bold("Staged Import Pipeline Status"));
  console.log(displaySeparator());
  console.log();

  // Stage 1: Message Extraction
  const messageStats = await prisma.stagedMessage.groupBy({
    by: ["status"],
    _count: true,
  });

  const messagePending = messageStats.find((s) => s.status === "pending")?._count || 0;
  const messageExtracted = messageStats.find((s) => s.status === "extracted")?._count || 0;
  const messageFailed = messageStats.find((s) => s.status === "failed")?._count || 0;
  const messageSkipped = messageStats.find((s) => s.status === "skipped")?._count || 0;
  const messageTotal = messagePending + messageExtracted + messageFailed + messageSkipped;

  console.log(bold("Stage 1: Message Extraction"));
  console.log(`  Pending:    ${yellow(messagePending.toString())} messages`);
  console.log(`  Extracted:  ${green(messageExtracted.toString())} messages`);
  console.log(`  Failed:     ${messageFailed} messages`);
  console.log(`  Skipped:    ${messageSkipped} messages`);
  console.log(dim(`  ${"─".repeat(40)}`));
  console.log(`  Total:      ${messageTotal} messages`);
  console.log();

  // Stage 2: LLM Extraction Review
  const extractionStats = await prisma.stagedExtraction.groupBy({
    by: ["status"],
    _count: true,
  });

  const extractionNeedsReview = extractionStats.find((s) => s.status === "needs_review")?._count || 0;
  const extractionConfirmed = extractionStats.find((s) => s.status === "confirmed")?._count || 0;
  const extractionEdited = extractionStats.find((s) => s.status === "edited")?._count || 0;
  const extractionSkipped = extractionStats.find((s) => s.status === "skipped")?._count || 0;
  const extractionTotal = extractionNeedsReview + extractionConfirmed + extractionEdited + extractionSkipped;

  // Breakdown of needs_review
  const lowConfidence = await prisma.stagedExtraction.count({
    where: { status: "needs_review", confidence: "low" },
  });
  const mediumConfidence = await prisma.stagedExtraction.count({
    where: { status: "needs_review", confidence: "medium" },
  });
  const withAlternatives = await prisma.stagedExtraction.count({
    where: { status: "needs_review", alternativeBooks: { not: null } },
  });

  console.log(bold("Stage 2: LLM Extraction Review"));
  if (extractionNeedsReview > 0) {
    console.log(`  Needs Review:   ${yellow(extractionNeedsReview.toString())} extractions`);
    console.log(dim(`    - ${lowConfidence} low confidence`));
    console.log(dim(`    - ${mediumConfidence} medium confidence`));
    console.log(dim(`    - ${withAlternatives} with alternatives`));
  } else {
    console.log(`  Needs Review:   0 extractions`);
  }
  console.log(`  Confirmed:      ${green(extractionConfirmed.toString())} extractions`);
  console.log(`  Edited:         ${extractionEdited} extractions`);
  console.log(`  Skipped:        ${extractionSkipped} extractions`);
  console.log(dim(`  ${"─".repeat(40)}`));
  console.log(`  Total:          ${extractionTotal} extractions`);
  console.log();

  // Stage 3: Google Books Enrichment
  const enrichmentStats = await prisma.stagedEnrichment.groupBy({
    by: ["status"],
    _count: true,
  });

  const enrichmentNeedsSelection = enrichmentStats.find((s) => s.status === "needs_selection")?._count || 0;
  const enrichmentSelected = enrichmentStats.find((s) => s.status === "selected")?._count || 0;
  const enrichmentIsbnEntered = enrichmentStats.find((s) => s.status === "isbn_entered")?._count || 0;
  const enrichmentSkipped = enrichmentStats.find((s) => s.status === "skipped")?._count || 0;
  const enrichmentTotal = enrichmentNeedsSelection + enrichmentSelected + enrichmentIsbnEntered + enrichmentSkipped;

  // Breakdown of needs_selection
  const multipleResults = await prisma.stagedEnrichment.count({
    where: { status: "needs_selection", hasMultipleResults: true },
  });
  const noResults = await prisma.stagedEnrichment.count({
    where: { status: "needs_selection", hasNoResults: true },
  });
  const missingCover = await prisma.stagedEnrichment.count({
    where: { status: "needs_selection", missingCover: true },
  });
  const missingMetadata = await prisma.stagedEnrichment.count({
    where: { status: "needs_selection", missingMetadata: true },
  });

  console.log(bold("Stage 3: Google Books Enrichment"));
  if (enrichmentNeedsSelection > 0) {
    console.log(`  Needs Selection: ${yellow(enrichmentNeedsSelection.toString())} enrichments`);
    console.log(dim(`    - ${multipleResults} multiple results`));
    console.log(dim(`    - ${noResults} no results`));
    console.log(dim(`    - ${missingCover} missing cover`));
    console.log(dim(`    - ${missingMetadata} missing metadata`));
  } else {
    console.log(`  Needs Selection: 0 enrichments`);
  }
  console.log(`  Selected:        ${green(enrichmentSelected.toString())} enrichments`);
  console.log(`  ISBN Entered:    ${enrichmentIsbnEntered} enrichments`);
  console.log(`  Skipped:         ${enrichmentSkipped} enrichments`);
  console.log(dim(`  ${"─".repeat(40)}`));
  console.log(`  Total:           ${enrichmentTotal} enrichments`);
  console.log();

  // Stage 4: Finalization
  const finalized = await prisma.stagedEnrichment.count({
    where: {
      status: { in: ["selected", "isbn_entered"] },
      bookId: { not: null },
    },
  });

  const readyToFinalize = await prisma.stagedEnrichment.count({
    where: {
      status: { in: ["selected", "isbn_entered"] },
      bookId: null,
    },
  });

  console.log(bold("Stage 4: Finalization"));
  console.log(`  Ready to finalize: ${yellow(readyToFinalize.toString())} enrichments`);
  console.log(`  Finalized:         ${green(finalized.toString())} enrichments`);
  console.log();

  // Next Steps
  console.log(bold("Next Steps:"));
  console.log();

  if (messagePending > 0) {
    console.log(`  1. Run: ${green("npm run import -- process")}${messagePending > 10 ? ` ${dim("--limit 10")}` : ""}`);
    console.log(`     Process ${messagePending} pending messages with LLM`);
    console.log();
  }

  if (extractionNeedsReview > 0) {
    const filterSuggestions = [];
    if (lowConfidence > 0) filterSuggestions.push("--filter low");
    if (withAlternatives > 0) filterSuggestions.push("--filter alternatives");

    console.log(`  2. Run: ${green("npm run import -- review-extractions")}${filterSuggestions.length > 0 ? ` ${dim(filterSuggestions[0])}` : ""}`);
    console.log(`     Review ${extractionNeedsReview} extractions needing manual review`);
    console.log();
  }

  const readyToEnrich = extractionConfirmed + extractionEdited - enrichmentTotal;
  if (readyToEnrich > 0) {
    console.log(`  3. Run: ${green("npm run import -- enrich")}`);
    console.log(`     Enrich ${readyToEnrich} confirmed extractions with Google Books`);
    console.log();
  }

  if (enrichmentNeedsSelection > 0) {
    const filterSuggestions = [];
    if (multipleResults > 0) filterSuggestions.push("--filter multiple");
    if (noResults > 0) filterSuggestions.push("--filter none");

    console.log(`  4. Run: ${green("npm run import -- review-enrichments")}${filterSuggestions.length > 0 ? ` ${dim(filterSuggestions[0])}` : ""}`);
    console.log(`     Review ${enrichmentNeedsSelection} enrichments needing book selection`);
    console.log();
  }

  if (readyToFinalize > 0) {
    console.log(`  5. Run: ${green("npm run import -- finalize")}${readyToFinalize > 10 ? ` ${dim("--dry-run")}` : ""}`);
    console.log(`     Create ${readyToFinalize} Book and Review records`);
    console.log();
  }

  if (messagePending === 0 && extractionNeedsReview === 0 && readyToEnrich === 0 && enrichmentNeedsSelection === 0 && readyToFinalize === 0) {
    console.log(green("  ✓ All stages complete! No pending work."));
    console.log();
  }

  await prisma.$disconnect();
}
