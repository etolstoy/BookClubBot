import { PrismaClient } from "@prisma/client";
import { searchBookByISBN } from "../src/services/googlebooks.js";

const prisma = new PrismaClient();

async function updateEnrichmentWithISBN(
  enrichmentId: number,
  isbn: string
): Promise<void> {
  console.log(`\nSearching Google Books for ISBN ${isbn}...`);

  const result = await searchBookByISBN(isbn);

  if (!result) {
    throw new Error(`No book found for ISBN: ${isbn}`);
  }

  console.log(`✓ Found: "${result.title}" by ${result.author || "Unknown"}`);
  console.log(`  Year: ${result.publicationYear || "N/A"} | Pages: ${result.pageCount || "N/A"}`);
  console.log(`  Cover: ${result.coverUrl ? "✓" : "✗"} | Description: ${result.description ? "✓" : "✗"}`);
  console.log(`  Genres: ${result.genres?.length ? result.genres.join(", ") : "N/A"}`);

  await prisma.stagedEnrichment.update({
    where: { id: enrichmentId },
    data: {
      status: "isbn_entered",
      selectedGoogleBooksId: result.googleBooksId,
      selectedBookData: JSON.stringify(result),
      enteredIsbn: isbn,
    },
  });

  console.log(`✓ Updated enrichment ${enrichmentId}`);
}

async function postponeEnrichment(enrichmentId: number): Promise<void> {
  await prisma.stagedEnrichment.update({
    where: { id: enrichmentId },
    data: { createdAt: new Date() },
  });

  console.log(`⏭ Postponed enrichment ${enrichmentId}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage:");
    console.log("  npx tsx scripts/update-isbn.ts <enrichment_id> <isbn>");
    console.log("  npx tsx scripts/update-isbn.ts <enrichment_id> postpone");
    process.exit(1);
  }

  const enrichmentId = parseInt(args[0], 10);
  const action = args[1];

  if (action === "postpone") {
    await postponeEnrichment(enrichmentId);
  } else {
    await updateEnrichmentWithISBN(enrichmentId, action);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
