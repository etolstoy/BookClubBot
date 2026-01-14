import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const enrichments = await prisma.stagedEnrichment.findMany({
    where: {
      status: "needs_selection",
      OR: [{ missingCover: true }, { missingMetadata: true }],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Found ${enrichments.length} enrichments with quality issues\n`);

  for (let i = 0; i < enrichments.length; i++) {
    const e = enrichments[i];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[${i + 1}/${enrichments.length}] Enrichment ID: ${e.id}`);
    console.log(`Title: "${e.searchTitle}"`);
    console.log(`Author: ${e.searchAuthor || "Unknown"}`);

    const results = e.googleBooksResults ? JSON.parse(e.googleBooksResults) : [];

    if (results.length > 0) {
      const result = results[0];
      console.log(`\nCurrent result:`);
      console.log(`  Title: ${result.title}`);
      console.log(`  Author: ${result.author || "N/A"}`);
      console.log(`  ISBN: ${result.isbn || "N/A"}`);
      console.log(`  Year: ${result.publicationYear || "N/A"}`);
      console.log(`  Cover: ${result.coverUrl ? "✓" : "✗"}`);
      console.log(`  Description: ${result.description ? "✓" : "✗"}`);
      console.log(`  Genres: ${result.genres?.length ? result.genres.join(", ") : "✗"}`);
      console.log(`  Pages: ${result.pageCount || "✗"}`);
    }

    console.log(`${"=".repeat(70)}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
