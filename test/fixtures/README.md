# Test Fixtures

This directory contains static test data used across the test suite. These fixtures provide realistic, repeatable test scenarios without requiring external API calls.

## Directory Structure

```
fixtures/
├── reviews/              # Anonymized review text from production
├── books/                # Google Books API response examples
├── gpt-responses/        # OpenAI GPT extraction examples
└── README.md            # This file
```

---

## 📝 **reviews/**

### Purpose
Contains real review text anonymized by AI while preserving exact book titles and authors.

### Files

**`anonymized-samples.json`** (50 reviews)
- Generated from production database via `npm run anonymize`
- All PII removed, safe to commit
- Contains: review text, sentiment, book metadata, test metadata
- Statistics: 47 Russian, 1 English, 2 Mixed language
- Complexity: 29 Medium, 21 Complex cases
- Length range: 26 - 2,834 characters

**`anonymized-samples.example.json`** (5 reviews)
- Small example file showing the format
- Used for documentation

### Usage Example

```typescript
import anonymizedReviews from '@test/fixtures/reviews/anonymized-samples.json';

it('should extract book from Russian review', () => {
  const fixture = anonymizedReviews.reviews.find(
    r => r.book.title === 'Война и мир'
  );

  expect(fixture).toBeDefined();
  expect(fixture.testMetadata.language).toBe('russian');
});
```

### When to Use
- E2E tests for review processing pipeline
- Testing book extraction with realistic text patterns
- Testing sentiment analysis with varied inputs
- Testing different language/complexity scenarios

---

## 📚 **books/**

### Purpose
Contains Google Books API response examples for testing book enrichment without hitting the real API.

### Files

**`google-books-responses.json`**
- Various Google Books API response formats
- Complete book data, minimal data, edge cases
- Search results with multiple items
- Examples: no ISBN, no cover, multiple authors, comics, non-fiction

**`sample-books.json`**
- 10 pre-defined books for seeding test database
- Mix of English and Russian classics
- Includes all metadata fields (ISBN, cover URL, genres)

### Usage Example

```typescript
import googleBooksResponses from '@test/fixtures/books/google-books-responses.json';

it('should handle book with no ISBN', () => {
  const fixture = googleBooksResponses.examples.no_isbn;

  const result = parseGoogleBooksResponse(fixture);

  expect(result.isbn).toBeNull();
  expect(result.title).toBe('Self-Published Masterpiece');
});
```

### When to Use
- Unit tests for Google Books service
- Testing book enrichment logic
- Testing edge cases (missing fields, multiple authors)
- Mocking Google Books API responses

---

## 🤖 **gpt-responses/**

### Purpose
Contains OpenAI GPT response examples for testing book extraction and sentiment analysis without calling the real API.

### Files

**`book-extractions.json`**
- GPT-4o book extraction responses
- Various confidence levels (high/medium/low)
- Different mention patterns (quotes, dashes, guillemets)
- Edge cases: failed extraction, multiple books, ambiguous input
- Examples for English, Russian, and command format

**`sentiment-analysis.json`**
- GPT-4o-mini sentiment analysis responses
- Clear cases: positive, negative, neutral
- Mixed sentiments, sarcastic, ambiguous content
- Examples in English and Russian
- Emoji and casual language examples

### Usage Example

```typescript
import gptExtractions from '@test/fixtures/gpt-responses/book-extractions.json';

it('should handle high confidence extraction', () => {
  const fixture = gptExtractions.examples.high_confidence_english;

  mockNextBookExtraction(fixture.response);

  const result = await extractBookInfo(fixture.input);

  expect(result.title).toBe('The Great Gatsby');
  expect(result.confidence).toBe('high');
});
```

### When to Use
- Unit tests for book extraction service
- Unit tests for sentiment analysis service
- Testing different confidence scenarios
- Testing edge cases (extraction failures, ambiguous input)
- Avoiding OpenAI API calls in tests

---

## 🎯 **How to Choose Which Fixtures to Use**

### For E2E Tests
**Use**: `reviews/anonymized-samples.json`
- Contains full review text with realistic patterns
- Tests entire pipeline from text → extraction → enrichment → creation

### For Unit Tests (Book Extraction)
**Use**: `gpt-responses/book-extractions.json`
- Isolated GPT responses
- Fast, repeatable tests without API calls

### For Unit Tests (Sentiment Analysis)
**Use**: `gpt-responses/sentiment-analysis.json`
- Isolated sentiment responses
- Fast, repeatable tests without API calls

### For Unit Tests (Book Enrichment)
**Use**: `books/google-books-responses.json`
- Google Books API response examples
- Test parsing logic and edge cases

### For Database Seeding
**Use**: `books/sample-books.json`
- Pre-defined book data
- Quick test database setup

---

## 🔄 **Regenerating Fixtures**

### Anonymized Reviews
```bash
npm run anonymize
```

This will:
1. Fetch 50 random reviews from production database
2. Use OpenAI to rewrite them (anonymize user content)
3. Preserve exact book titles and authors
4. Save to `reviews/anonymized-samples.json`

**Cost**: ~$0.01 (GPT-4o-mini)
**Duration**: ~1-2 minutes

### Other Fixtures
The `books/` and `gpt-responses/` fixtures are manually curated examples. Update them as needed when you discover new edge cases or patterns to test.

---

## 📊 **Fixture Statistics**

| Directory | Files | Total Examples | Languages | Use Case |
|-----------|-------|----------------|-----------|----------|
| reviews/ | 2 | 50 reviews | Russian, English, Mixed | E2E tests |
| books/ | 2 | 11 examples | - | Unit tests, DB seeding |
| gpt-responses/ | 2 | 25 examples | Russian, English | Unit tests |

---

## 🔒 **Privacy & Safety**

✅ **All fixtures are safe to commit to git**
- `reviews/`: Anonymized by AI, no PII
- `books/`: Public book metadata only
- `gpt-responses/`: Synthetic examples

❌ **Never commit**:
- Production database dumps
- Real user data (usernames, IDs, personal info)
- API keys or secrets

---

## 📝 **Adding New Fixtures**

When you discover a new edge case or pattern:

1. **Document it**: Add to the appropriate JSON file
2. **Include metadata**: Description, expected behavior
3. **Write a test**: Use the new fixture in a test
4. **Commit**: Safe to commit since it's synthetic data

**Example**:
```json
"new_edge_case": {
  "input": "Edge case description",
  "response": { "expected": "behavior" }
}
```

---

## 🔍 **Finding Fixtures**

Use `jq` for quick searches:

```bash
# Find reviews for a specific book
cat reviews/anonymized-samples.json | jq '.reviews[] | select(.book.title == "1984")'

# Count reviews by language
cat reviews/anonymized-samples.json | jq '.reviews | group_by(.testMetadata.language) | map({language: .[0].testMetadata.language, count: length})'

# Find complex test cases
cat reviews/anonymized-samples.json | jq '.reviews[] | select(.testMetadata.complexity == "complex")'
```

---

## 📚 **Related Documentation**

- [Test README](../README.md) - General testing guide
- [TESTING_PLAN.md](../../TESTING_PLAN.md) - Implementation roadmap
- [Scripts README](../../scripts/README.md) - Anonymization script docs
