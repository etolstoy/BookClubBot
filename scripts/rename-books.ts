#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

async function renameBooks() {
  const prisma = new PrismaClient();

  console.log("Renaming Books");
  console.log("=".repeat(70));
  console.log();

  const renames = [
    {
      id: 594,
      oldTitle: "Невьианская башня",
      oldAuthor: "Игорь Михайлович Шакинко",
      newTitle: "Невьянская башня",
      newAuthor: "Игорь Михайлович Шакинко",
    },
    {
      id: 551,
      oldTitle: "Komitet okhrany mostov",
      oldAuthor: "Dmitriĭ Sergeevich Zakharov",
      newTitle: "Комитет охраны мостов",
      newAuthor: "Дмитрий Захаров",
    },
    {
      id: 546,
      oldTitle: "Vegetatsija",
      oldAuthor: "Aleksej Ivanov",
      newTitle: "Вегетация",
      newAuthor: "Алексей Иванов",
    },
  ];

  let updated = 0;

  for (const rename of renames) {
    const book = await prisma.book.findUnique({ where: { id: rename.id } });

    if (!book) {
      console.log(`⚠ Book ${rename.id} not found, skipping`);
      continue;
    }

    console.log(`Book ${rename.id}:`);
    console.log(`  Old: "${rename.oldTitle}" by ${rename.oldAuthor}`);
    console.log(`  New: "${rename.newTitle}" by ${rename.newAuthor}`);

    await prisma.book.update({
      where: { id: rename.id },
      data: {
        title: rename.newTitle,
        author: rename.newAuthor,
      },
    });

    console.log(`  ✓ Updated`);
    console.log();
    updated++;
  }

  console.log("=".repeat(70));
  console.log(`✅ Renamed ${updated} book(s)`);

  await prisma.$disconnect();
}

renameBooks().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
