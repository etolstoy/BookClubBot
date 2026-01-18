# Scripts Directory

This directory contains utility scripts for the BookClubBot project.

## fixtures-editor-server.ts + fixtures-editor.html

Web-based editor for browsing and editing test review fixtures.

### Purpose

Provides a simple browser interface to:
1. Browse all 50 anonymized review fixtures
2. Search and filter reviews by title, author
3. Edit review text and book metadata
4. Update test metadata (language, complexity, sentiment)
5. Save changes back to the JSON file
6. Create backups before making changes

### Usage

```bash
npm run fixtures:edit
```

Then open your browser to: **http://localhost:3002**

### Features

- **🔍 Search & Filter**: Find reviews by book title or author
- **✏️ Edit Everything**: Review text, book data, sentiment, metadata
- **💾 Auto-Save**: Ctrl+S keyboard shortcut
- **📊 Live Stats**: See total reviews, language distribution
- **💾 Backup**: Create timestamped backups before editing
- **⚠️ Unsaved Changes Warning**: Prevents accidental data loss

### Interface

```
┌─────────────┬──────────────────────────────┐
│  Sidebar    │  Main Editor                 │
│             │                              │
│ Search Box  │  Book Information            │
│             │  ├─ Title                    │
│ Review 1    │  ├─ Author                   │
│ Review 2    │  ├─ ISBN                     │
│ Review 3 ✓  │  └─ Publication Year         │
│ ...         │                              │
│             │  Review Content              │
│             │  ├─ Review Text (textarea)   │
│             │  └─ Sentiment (dropdown)     │
│             │                              │
│             │  Test Metadata               │
│             │  ├─ Language                 │
│             │  ├─ Complexity               │
│             │  └─ Book Mention Pattern     │
│             │                              │
│             │  [💾 Save]  [💾 Backup]      │
└─────────────┴──────────────────────────────┘
```

### Keyboard Shortcuts

- **Ctrl+S** (or Cmd+S): Save current review
- **Search**: Start typing to filter reviews

### Backup Files

Backups are saved to: `test/fixtures/reviews/anonymized-samples.backup-TIMESTAMP.json`

Format: `anonymized-samples.backup-2026-01-17T19-30-00-000Z.json`

### When to Use

- Fix typos in review text
- Update book metadata (correct author names, add ISBNs)
- Adjust test metadata (complexity, language classification)
- Create new test cases by duplicating and modifying existing reviews
- Fix sentiment classifications

### Safety

- ✅ Creates backups on request
- ✅ Warns before discarding unsaved changes
- ✅ Prevents page close with unsaved changes
- ✅ Validates required fields (title, review text)

---

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
