# Scripts Directory

This directory contains utility scripts for the BookClubBot project.

## anonymize-reviews.ts

Generates anonymized test fixtures from production reviews using OpenAI.

### Purpose

Creates realistic test data by:
1. Extracting 50 random reviews from your production database
2. Using OpenAI (GPT-4o-mini) to rewrite each review with different wording
3. Preserving **exact** book titles and author names
4. Preserving the mention pattern (quotes, dashes, etc.)
5. Removing all user-specific content (names, personal details, etc.)

### Usage

```bash
npm run anonymize
```

### Output

Saves anonymized reviews to: `test/fixtures/reviews/anonymized-samples.json`

The output includes:
- Anonymized review text
- Original book metadata (title, author, ISBN, etc.)
- Test metadata (language, complexity, mention pattern)
- Sentiment classification

### Example Output Structure

```json
{
  "generatedAt": "2026-01-17T10:30:00.000Z",
  "totalReviews": 50,
  "reviews": [
    {
      "reviewText": "Just finished reading \"The Great Gatsby\" by F. Scott Fitzgerald. What a masterpiece!",
      "sentiment": "positive",
      "book": {
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "isbn": "9780743273565",
        "publicationYear": 1925
      },
      "testMetadata": {
        "originalLength": 156,
        "hasHashtag": true,
        "language": "english",
        "bookMentionPattern": "double-quotes",
        "complexity": "simple"
      }
    }
  ]
}
```

### Cost Estimate

- Model: GPT-4o-mini
- Cost: ~$0.01 per 50 reviews
- Duration: ~1-2 minutes (with 1s rate limiting)

### Requirements

- Production database with reviews
- `OPENAI_API_KEY` in `.env`
- At least 50 reviews in the database

### Privacy

This script:
- ✅ Runs locally on your machine
- ✅ Removes all user-identifiable information
- ✅ Output can be safely committed to git
- ✅ Only preserves book metadata (public information)
- ❌ Does NOT send data to third parties (except OpenAI for rewriting)

### When to Run

Run this script whenever you want to refresh your test fixtures with new patterns from production:
- After discovering new edge cases
- When adding new review formats
- Before major refactoring (to ensure tests cover current patterns)

### Integration with Tests

The generated `anonymized-samples.json` is used by:
- E2E tests for review processing pipeline
- Book extraction service tests
- Sentiment analysis tests
- API contract tests

See `test/e2e/` for examples.
