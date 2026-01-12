#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function batchUpdates() {
  const prisma = new PrismaClient();

  console.log("Batch Book Updates");
  console.log("=".repeat(70));
  console.log();

  // Task 1: Create "Глаз в пирамиде" and move review 327
  console.log("Task 1: Moving review from The Plot to Глаз в пирамиде");
  console.log("-".repeat(70));

  // Check if book exists
  let glazBook = await prisma.book.findFirst({
    where: {
      title: "Глаз в пирамиде",
      author: "Роберт Антон Уилсон",
    },
  });

  if (!glazBook) {
    glazBook = await prisma.book.create({
      data: {
        title: "Глаз в пирамиде",
        author: "Роберт Антон Уилсон",
      },
    });
    console.log(`✓ Created book: "${glazBook.title}" by ${glazBook.author} (ID: ${glazBook.id})`);
  } else {
    console.log(`⊘ Book already exists: "${glazBook.title}" (ID: ${glazBook.id})`);
  }

  // Move review 327
  const review327 = await prisma.review.findUnique({ where: { id: 327 } });
  if (review327) {
    await prisma.review.update({
      where: { id: 327 },
      data: { bookId: glazBook.id },
    });
    console.log(`✓ Moved review 327 from The Plot to "${glazBook.title}"`);
  } else {
    console.log(`⚠ Review 327 not found`);
  }

  console.log();

  // Task 2: Rename "Pokhod na Bar-Khoto"
  console.log("Task 2: Renaming Pokhod na Bar-Khoto");
  console.log("-".repeat(70));

  const pokhodBook = await prisma.book.findUnique({ where: { id: 584 } });
  if (pokhodBook) {
    await prisma.book.update({
      where: { id: 584 },
      data: {
        title: "Поход на Бар-Хото",
        author: "Леонид Юзефович",
      },
    });
    console.log(`✓ Renamed book 584:`);
    console.log(`  From: "${pokhodBook.title}" by ${pokhodBook.author}`);
    console.log(`  To:   "Поход на Бар-Хото" by Леонид Юзефович`);
  } else {
    console.log(`⚠ Book 584 not found`);
  }

  console.log();

  // Task 3: Create "Пропасть" and prepare for merge
  console.log("Task 3: Creating Пропасть by Robert Harris");
  console.log("-".repeat(70));

  let propastBook = await prisma.book.findFirst({
    where: {
      title: "Пропасть",
      author: "Robert Harris",
    },
  });

  if (!propastBook) {
    propastBook = await prisma.book.create({
      data: {
        title: "Пропасть",
        author: "Robert Harris",
      },
    });
    console.log(`✓ Created book: "${propastBook.title}" by ${propastBook.author} (ID: ${propastBook.id})`);
  } else {
    console.log(`⊘ Book already exists: "${propastBook.title}" (ID: ${propastBook.id})`);
  }

  console.log(`  Use: npm run merge-books -- "Закон забвения" "Пропасть"`);
  console.log();

  console.log("=".repeat(70));
  console.log("✅ Batch updates complete!");
  console.log("   Note: Run the merge command above to complete Task 3");

  await prisma.$disconnect();
}

batchUpdates().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
