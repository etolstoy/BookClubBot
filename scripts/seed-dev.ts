/**
 * Development seed script - creates sample data for manual testing
 */
import prisma from "../src/lib/prisma.js";

async function seed() {
  console.log("🌱 Seeding development database...");

  // Create books
  const book1 = await prisma.book.create({
    data: {
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      googleBooksId: "iXn5CwAAQBAJ",
      coverUrl: "http://books.google.com/books/content?id=iXn5CwAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
      description: "The Great Gatsby is a 1925 novel by American writer F. Scott Fitzgerald.",
      genres: JSON.stringify(["Fiction", "Classics"]),
      publicationYear: 1925,
      isbn: "9780743273565",
      pageCount: 180,
    },
  });

  const book2 = await prisma.book.create({
    data: {
      title: "1984",
      author: "George Orwell",
      googleBooksId: "kotPYEqx7kMC",
      coverUrl: "http://books.google.com/books/content?id=kotPYEqx7kMC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
      description: "A dystopian social science fiction novel and cautionary tale.",
      genres: JSON.stringify(["Fiction", "Dystopian", "Science Fiction"]),
      publicationYear: 1949,
      isbn: "9780451524935",
      pageCount: 328,
    },
  });

  const book3 = await prisma.book.create({
    data: {
      title: "To Kill a Mockingbird",
      author: "Harper Lee",
      googleBooksId: "PGR2AwAAQBAJ",
      coverUrl: "http://books.google.com/books/content?id=PGR2AwAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
      description: "A gripping, heart-wrenching, and wholly remarkable tale of coming-of-age in a South poisoned by virulent prejudice.",
      genres: JSON.stringify(["Fiction", "Classics", "Historical Fiction"]),
      publicationYear: 1960,
      isbn: "9780061120084",
      pageCount: 324,
    },
  });

  console.log("✅ Created 3 books");

  // Create reviews for book 1
  await prisma.review.create({
    data: {
      bookId: book1.id,
      telegramUserId: BigInt(123456789),
      telegramUsername: "john_reader",
      telegramDisplayName: "John Reader",
      reviewText: "Абсолютно потрясающая книга! Фицджеральд создал незабываемую историю о мечтах, любви и трагедии. Язык невероятно красивый, каждое предложение - произведение искусства. Гэтсби - один из самых запоминающихся персонажей в литературе.",
      sentiment: "positive",
      reviewedAt: new Date("2024-01-15T10:30:00Z"),
      messageId: BigInt(101),
      chatId: BigInt(1001),
    },
  });

  await prisma.review.create({
    data: {
      bookId: book1.id,
      telegramUserId: BigInt(234567890),
      telegramUsername: "maria_books",
      telegramDisplayName: "Maria Bookworm",
      reviewText: "Я ожидала большего от этой книги. Сюжет медленный, персонажи мне не понравились. Возможно, это классика, но мне было скучно. Закончила только потому, что это была обязательная литература.",
      sentiment: "negative",
      reviewedAt: new Date("2024-01-20T14:15:00Z"),
      messageId: BigInt(102),
      chatId: BigInt(1001),
    },
  });

  await prisma.review.create({
    data: {
      bookId: book1.id,
      telegramUserId: BigInt(345678901),
      telegramUsername: "alex_critic",
      telegramDisplayName: "Alex Critic",
      reviewText: "Интересная книга с красивым языком. Некоторые моменты зацепили, некоторые показались затянутыми. В целом достойное произведение американской литературы, но не шедевр на все времена.",
      sentiment: "neutral",
      reviewedAt: new Date("2024-02-01T09:45:00Z"),
      messageId: BigInt(103),
      chatId: BigInt(1001),
    },
  });

  // Create reviews for book 2
  await prisma.review.create({
    data: {
      bookId: book2.id,
      telegramUserId: BigInt(123456789),
      telegramUsername: "john_reader",
      telegramDisplayName: "John Reader",
      reviewText: "Пугающе актуальная антиутопия. Оруэлл предсказал многие аспекты современного общества. Концепция двоемыслия, тоталитарного контроля и манипуляции информацией заставляет задуматься о нашем мире. Обязательно к прочтению!",
      sentiment: "positive",
      reviewedAt: new Date("2024-02-10T16:20:00Z"),
      messageId: BigInt(104),
      chatId: BigInt(1001),
    },
  });

  await prisma.review.create({
    data: {
      bookId: book2.id,
      telegramUserId: BigInt(456789012),
      telegramUsername: "bookworm2024",
      telegramDisplayName: "Bookworm 2024",
      reviewText: "Очень мрачная и депрессивная книга. Да, она важная, но читать её было тяжело. Атмосфера безнадёжности давит на протяжении всего повествования. Концовка разочаровала.",
      sentiment: "negative",
      reviewedAt: new Date("2024-02-12T11:00:00Z"),
      messageId: BigInt(105),
      chatId: BigInt(1001),
    },
  });

  // Create reviews for book 3
  await prisma.review.create({
    data: {
      bookId: book3.id,
      telegramUserId: BigInt(234567890),
      telegramUsername: "maria_books",
      telegramDisplayName: "Maria Bookworm",
      reviewText: "Замечательная книга о справедливости, предрассудках и взрослении. Глазами ребёнка показаны сложные темы расизма и неравенства. Аттикус Финч - пример настоящего героя. Читается легко, несмотря на серьёзность темы.",
      sentiment: "positive",
      reviewedAt: new Date("2024-02-15T13:30:00Z"),
      messageId: BigInt(106),
      chatId: BigInt(1001),
    },
  });

  await prisma.review.create({
    data: {
      bookId: book3.id,
      telegramUserId: BigInt(567890123),
      telegramUsername: "reader_pro",
      telegramDisplayName: "Professional Reader",
      reviewText: "Классика американской литературы, но местами устаревшая. Важные темы подняты, но подача кажется слишком простой для взрослого читателя. Хороша для школьной программы, но не более того. Вторую половину пришлось заставлять себя дочитать.",
      sentiment: "neutral",
      reviewedAt: new Date("2024-02-18T10:15:00Z"),
      messageId: BigInt(107),
      chatId: BigInt(1001),
    },
  });

  console.log("✅ Created 7 reviews");

  // Summary
  const bookCount = await prisma.book.count();
  const reviewCount = await prisma.review.count();

  console.log("\n📊 Database seeded successfully!");
  console.log(`   Books: ${bookCount}`);
  console.log(`   Reviews: ${reviewCount}`);
  console.log("\n💡 You can now test the Mini App with this data\n");
}

seed()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
