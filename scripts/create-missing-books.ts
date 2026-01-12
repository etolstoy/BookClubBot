#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function createMissingBooks() {
  const prisma = new PrismaClient();

  console.log("Creating missing target books for merge operations");
  console.log("=".repeat(70));
  console.log();

  const booksToCreate = [
    { title: "Сценаристка", author: "Светлана Павлова" },
    { title: "Город и город", author: "Чайна Мьевиль" },
    { title: "Мёртвая вода", author: "Оливье Норек" },
    { title: "Ученики Ворона (цикл)", author: "Андрей Васильев" },
    { title: "Слон", author: "Саша Филипенко" },
    { title: "Лекарь", author: "Ной Гордон" },
  ];

  let created = 0;
  let skipped = 0;

  for (const bookData of booksToCreate) {
    // Check if book already exists
    const existing = await prisma.book.findFirst({
      where: {
        title: bookData.title,
        author: bookData.author,
      },
    });

    if (existing) {
      console.log(`⊘ "${bookData.title}" by ${bookData.author} - already exists (ID: ${existing.id})`);
      skipped++;
      continue;
    }

    // Create the book
    const book = await prisma.book.create({
      data: {
        title: bookData.title,
        author: bookData.author,
      },
    });

    console.log(`✓ Created "${bookData.title}" by ${bookData.author} (ID: ${book.id})`);
    created++;
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`Summary: ${created} created, ${skipped} already existed`);

  await prisma.$disconnect();
}

createMissingBooks().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
