#!/usr/bin/env tsx
/**
 * Anonymization Script for Test Fixtures
 *
 * This script:
 * 1. Fetches 50 random reviews from production database
 * 2. Uses OpenAI to rewrite each review (anonymizing user content)
 * 3. Preserves exact book titles and author names
 * 4. Saves anonymized reviews as test fixtures
 *
 * Usage: npx tsx scripts/anonymize-reviews.ts
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../src/lib/config.js';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

interface AnonymizedReview {
  // Anonymized content
  reviewText: string;
  sentiment: 'positive' | 'negative' | 'neutral' | null;

  // Book information (preserved exactly)
  book: {
    title: string;
    author: string | null;
    isbn: string | null;
    publicationYear: number | null;
  };

  // Metadata for testing
  testMetadata: {
    originalLength: number;
    hasHashtag: boolean;
    language: 'russian' | 'english' | 'mixed';
    bookMentionPattern: string; // How book was mentioned: "quotes", dash, parentheses, etc.
    complexity: 'simple' | 'medium' | 'complex'; // For testing extraction difficulty
  };
}

interface AnonymizationResult {
  generatedAt: string;
  totalReviews: number;
  reviews: AnonymizedReview[];
}

async function detectLanguage(text: string): Promise<'russian' | 'english' | 'mixed'> {
  const cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;

  if (cyrillicCount > latinCount * 2) return 'russian';
  if (latinCount > cyrillicCount * 2) return 'english';
  return 'mixed';
}

function detectBookMentionPattern(text: string, bookTitle: string): string {
  if (text.includes(`"${bookTitle}"`)) return 'double-quotes';
  if (text.includes(`«${bookTitle}»`)) return 'guillemets';
  if (text.includes(`'${bookTitle}'`)) return 'single-quotes';
  if (text.includes(`(${bookTitle})`)) return 'parentheses';
  if (text.match(new RegExp(`${bookTitle}\\s*[-—–]`, 'i'))) return 'dash-after-title';
  if (text.match(new RegExp(`[-—–]\\s*${bookTitle}`, 'i'))) return 'dash-before-title';
  return 'no-quotes';
}

function assessComplexity(text: string, bookTitle: string, author: string | null): 'simple' | 'medium' | 'complex' {
  // Simple: Clear book mention with standard formatting
  if (text.includes(`"${bookTitle}"`) && author && text.includes(author)) {
    return 'simple';
  }

  // Complex: Missing info, ambiguous, or unusual formatting
  if (!author || text.length < 50 || !text.toLowerCase().includes(bookTitle.toLowerCase())) {
    return 'complex';
  }

  return 'medium';
}

async function anonymizeReview(
  originalText: string,
  bookTitle: string,
  author: string | null
): Promise<string> {
  const prompt = `Rewrite the following book review to anonymize it while preserving these EXACT elements:
- Book title: "${bookTitle}"
- Author name: ${author ? `"${author}"` : 'not mentioned'}
- The way the book/author is mentioned (quotes, dashes, etc.)
- The general sentiment and tone
- The approximate length

Change everything else: wording, specific opinions, personal details, examples, etc.

Original review:
${originalText}

Rewritten review (preserve book/author mentions EXACTLY as shown above):`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-efficient for text rewriting
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8, // Some creativity for natural variation
      max_tokens: 500,
    });

    const rewritten = response.choices[0]?.message?.content?.trim();
    if (!rewritten) {
      throw new Error('Empty response from OpenAI');
    }

    return rewritten;
  } catch (error) {
    console.error(`Failed to anonymize review: ${error}`);
    throw error;
  }
}

async function main() {
  console.log('🔍 Fetching 50 random reviews from database...\n');

  // Fetch 50 random reviews with their associated books
  const reviews = await prisma.review.findMany({
    take: 50,
    include: { book: true },
    orderBy: { reviewedAt: 'desc' }, // Get recent ones for relevance
  });

  if (reviews.length === 0) {
    console.error('❌ No reviews found in database!');
    process.exit(1);
  }

  console.log(`✅ Found ${reviews.length} reviews\n`);
  console.log('🤖 Anonymizing reviews with OpenAI (this may take 2-3 minutes)...\n');

  const anonymizedReviews: AnonymizedReview[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i];
    const book = review.book;

    if (!book) {
      console.log(`⚠️  Skipping review ${i + 1}/${reviews.length}: No associated book`);
      failCount++;
      continue;
    }

    try {
      console.log(`Processing ${i + 1}/${reviews.length}: "${book.title.substring(0, 40)}..."`);

      const anonymizedText = await anonymizeReview(
        review.reviewText,
        book.title,
        book.author
      );

      const language = await detectLanguage(review.reviewText);
      const mentionPattern = detectBookMentionPattern(review.reviewText, book.title);
      const complexity = assessComplexity(review.reviewText, book.title, book.author);

      anonymizedReviews.push({
        reviewText: anonymizedText,
        sentiment: review.sentiment as 'positive' | 'negative' | 'neutral' | null,
        book: {
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          publicationYear: book.publicationYear,
        },
        testMetadata: {
          originalLength: review.reviewText.length,
          hasHashtag: review.reviewText.includes('#рецензия'),
          language,
          bookMentionPattern: mentionPattern,
          complexity,
        },
      });

      successCount++;

      // Rate limiting: 1 request per second to avoid hitting OpenAI limits
      if (i < reviews.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Failed to anonymize review ${i + 1}: ${error}`);
      failCount++;
    }
  }

  console.log(`\n✅ Successfully anonymized ${successCount} reviews`);
  console.log(`❌ Failed to anonymize ${failCount} reviews\n`);

  // Save to JSON file
  const outputPath = path.join(process.cwd(), 'test/fixtures/reviews/anonymized-samples.json');

  const result: AnonymizationResult = {
    generatedAt: new Date().toISOString(),
    totalReviews: anonymizedReviews.length,
    reviews: anonymizedReviews,
  };

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`💾 Saved ${anonymizedReviews.length} anonymized reviews to:`);
  console.log(`   ${outputPath}\n`);

  // Print statistics
  console.log('📊 Statistics:');
  console.log(`   Languages: ${anonymizedReviews.filter(r => r.testMetadata.language === 'russian').length} Russian, ${anonymizedReviews.filter(r => r.testMetadata.language === 'english').length} English, ${anonymizedReviews.filter(r => r.testMetadata.language === 'mixed').length} Mixed`);
  console.log(`   Complexity: ${anonymizedReviews.filter(r => r.testMetadata.complexity === 'simple').length} Simple, ${anonymizedReviews.filter(r => r.testMetadata.complexity === 'medium').length} Medium, ${anonymizedReviews.filter(r => r.testMetadata.complexity === 'complex').length} Complex`);
  console.log(`   Sentiments: ${anonymizedReviews.filter(r => r.sentiment === 'positive').length} Positive, ${anonymizedReviews.filter(r => r.sentiment === 'negative').length} Negative, ${anonymizedReviews.filter(r => r.sentiment === 'neutral').length} Neutral, ${anonymizedReviews.filter(r => !r.sentiment).length} Unknown`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
