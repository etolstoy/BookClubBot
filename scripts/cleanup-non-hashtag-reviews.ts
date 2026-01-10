import { PrismaClient } from "@prisma/client";

const REVIEW_HASHTAG = process.env.REVIEW_HASHTAG || "#рецензия";
const dryRun = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

async function main() {
  console.log("Book Club Database Cleanup");
  console.log("==========================");
  console.log(`Review hashtag: ${REVIEW_HASHTAG}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("");

  // Step 1: Find reviews without the hashtag
  console.log("Step 1: Finding reviews without hashtag...");
  const reviewsWithoutHashtag = await prisma.review.findMany({
    where: {
      reviewText: {
        not: {
          contains: REVIEW_HASHTAG,
        },
      },
    },
    include: {
      book: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  console.log(`Found ${reviewsWithoutHashtag.length} reviews without ${REVIEW_HASHTAG}`);
  console.log("");

  if (reviewsWithoutHashtag.length === 0) {
    console.log("No reviews to delete.");
    return;
  }

  // Show some examples
  console.log("Examples of reviews to be deleted:");
  reviewsWithoutHashtag.slice(0, 5).forEach((review) => {
    console.log(`  - Message ${review.messageId}: ${review.book?.title || "No book"}`);
    console.log(`    Text preview: ${review.reviewText.substring(0, 80)}...`);
  });
  console.log("");

  // Step 2: Delete reviews
  if (!dryRun) {
    console.log("Step 2: Deleting reviews without hashtag...");
    const deleteResult = await prisma.review.deleteMany({
      where: {
        reviewText: {
          not: {
            contains: REVIEW_HASHTAG,
          },
        },
      },
    });
    console.log(`Deleted ${deleteResult.count} reviews`);
  } else {
    console.log("Step 2: [DRY RUN] Would delete reviews without hashtag");
  }
  console.log("");

  // Step 3: Find books with no reviews
  console.log("Step 3: Finding books with no associated reviews...");
  const booksWithoutReviews = await prisma.book.findMany({
    where: {
      reviews: {
        none: {},
      },
    },
    select: {
      id: true,
      title: true,
      author: true,
    },
  });

  console.log(`Found ${booksWithoutReviews.length} books with no reviews`);
  console.log("");

  if (booksWithoutReviews.length === 0) {
    console.log("No orphaned books to delete.");
    return;
  }

  // Show some examples
  console.log("Examples of books to be deleted:");
  booksWithoutReviews.slice(0, 10).forEach((book) => {
    console.log(`  - "${book.title}" by ${book.author || "Unknown"}`);
  });
  console.log("");

  // Step 4: Delete orphaned books
  if (!dryRun) {
    console.log("Step 4: Deleting books with no reviews...");
    const deleteBookResult = await prisma.book.deleteMany({
      where: {
        reviews: {
          none: {},
        },
      },
    });
    console.log(`Deleted ${deleteBookResult.count} books`);
  } else {
    console.log("Step 4: [DRY RUN] Would delete books with no reviews");
  }
  console.log("");

  // Summary
  console.log("Cleanup Summary");
  console.log("===============");
  console.log(`Reviews ${dryRun ? "would be" : ""} deleted: ${reviewsWithoutHashtag.length}`);
  console.log(`Books ${dryRun ? "would be" : ""} deleted: ${booksWithoutReviews.length}`);

  if (dryRun) {
    console.log("");
    console.log("This was a dry run. No data was deleted.");
    console.log("Run without --dry-run to actually delete the data.");
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
