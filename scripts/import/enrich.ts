import { PrismaClient } from "@prisma/client";
import { searchBookWithFallbacks } from "../../src/services/googlebooks.js";

export async function enrich(limit?: number): Promise<void> {
  const prisma = new PrismaClient();

  console.log("Staged Import: Enrich Stage");
  console.log("=".repeat(70));
  console.log(`Limit: ${limit || "no limit"}`);
  console.log();

  // Fetch confirmed or edited extractions that haven't been enriched yet
  const extractions = await prisma.stagedExtraction.findMany({
    where: {
      status: {
        in: ["confirmed", "edited"],
      },
      enrichmentId: null,
    },
    take: limit,
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${extractions.length} extractions to enrich`);
  console.log();

  let enriched = 0;
  let autoSelected = 0;
  let needsSelection = 0;
  let errors = 0;

  for (const extraction of extractions) {
    try {
      console.log(`[${enriched + 1}/${extractions.length}] Enriching "${extraction.title}" by ${extraction.author || "Unknown"}...`);

      // Use confirmed values if edited, otherwise use extracted values
      const searchTitle = extraction.confirmedTitle || extraction.title;
      const searchAuthor = extraction.confirmedAuthor || extraction.author;

      // Parse variants if available
      const titleVariants = extraction.titleVariants ? JSON.parse(extraction.titleVariants) : undefined;
      const authorVariants = extraction.authorVariants ? JSON.parse(extraction.authorVariants) : undefined;

      // Search Google Books with fallbacks
      const results = await searchBookWithFallbacks(
        searchTitle,
        searchAuthor || undefined,
        titleVariants,
        authorVariants
      );

      const resultCount = results ? (Array.isArray(results) ? results.length : 1) : 0;
      const resultsArray = results ? (Array.isArray(results) ? results : [results]) : [];

      // Analyze results and set quality flags
      const hasMultipleResults = resultCount >= 2;
      const hasNoResults = resultCount === 0;

      let missingCover = false;
      let missingMetadata = false;
      let selectedGoogleBooksId: string | null = null;
      let selectedBookData: string | null = null;
      let status = "needs_selection";

      if (resultCount === 1) {
        const result = resultsArray[0];
        missingCover = !result.coverUrl;
        missingMetadata =
          !result.description ||
          !result.genres ||
          result.genres.length === 0 ||
          !result.pageCount ||
          !result.publicationYear;

        // Auto-select if single result with good metadata
        if (!hasMultipleResults && !hasNoResults && !missingCover && !missingMetadata) {
          status = "selected";
          selectedGoogleBooksId = result.googleBooksId;
          selectedBookData = JSON.stringify(result);
          autoSelected++;
        }
      }

      // Create StagedEnrichment
      const enrichment = await prisma.stagedEnrichment.create({
        data: {
          searchTitle,
          searchAuthor,
          googleBooksResults: resultsArray.length > 0 ? JSON.stringify(resultsArray) : null,
          resultCount,
          status,
          hasMultipleResults,
          hasNoResults,
          missingCover,
          missingMetadata,
          selectedGoogleBooksId,
          selectedBookData,
        },
      });

      // Update extraction with link to enrichment
      await prisma.stagedExtraction.update({
        where: { id: extraction.id },
        data: {
          enrichmentId: enrichment.id,
        },
      });

      enriched++;

      if (status === "selected") {
        console.log(`  ✓ Auto-selected`);
      } else {
        needsSelection++;
        const reasons = [];
        if (hasMultipleResults) reasons.push("multiple results");
        if (hasNoResults) reasons.push("no results");
        if (missingCover) reasons.push("missing cover");
        if (missingMetadata) reasons.push("missing metadata");
        console.log(`  ⚠ Needs selection (${reasons.join(", ")})`);
      }

      // Rate limiting: wait 200ms between API calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  ✗ Error enriching extraction ${extraction.id}:`, error);
      errors++;
    }
  }

  console.log();
  console.log("Enrich complete!");
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Auto-selected: ${autoSelected}`);
  console.log(`  Needs selection: ${needsSelection}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}
