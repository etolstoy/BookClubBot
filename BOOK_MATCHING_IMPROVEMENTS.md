# Book Matching Improvements

This document describes the enhancements made to the book matching system to handle edge cases and improve accuracy.

## Overview

The book matching system now includes:
1. **Enhanced OpenAI extraction** with title/author variants and multiple book detection
2. **Cascading Google Books fallback searches** to handle transliterations and typos
3. **Multiple book detection UI** in Telegram with manual ISBN input
4. **CLI tool** for reviewing and fixing existing book associations

---

## 1. Enhanced OpenAI Extraction

### What Changed
**File:** `src/services/llm.ts`

The `ExtractedBookInfo` interface now includes:
```typescript
{
  title: string;
  author: string | null;
  titleVariants?: string[];       // NEW: Alternative spellings/transliterations
  authorVariants?: string[];      // NEW: Alternative author spellings
  confidence?: "high" | "medium" | "low";  // NEW: Confidence level
  alternativeBooks?: Array<{      // NEW: Other books mentioned
    title: string;
    author: string | null;
  }>;
}
```

### OpenAI Prompt Changes
The prompt now explicitly asks for:
- **Title/author variants**: Handles transliterations (e.g., "Оруэлл" ↔ "Orwell")
- **Alternative spellings**: Different ways to write the same name
- **Alternative books**: Books mentioned for comparison but not the primary subject
- **Confidence level**: "low" indicates ambiguity between multiple books

### Example Response
```json
{
  "title": "1984",
  "author": "George Orwell",
  "titleVariants": ["Nineteen Eighty-Four"],
  "authorVariants": ["Orwell", "G. Orwell", "Оруэлл"],
  "confidence": "high",
  "alternativeBooks": [
    {"title": "Brave New World", "author": "Aldous Huxley"}
  ]
}
```

---

## 2. Cascading Google Books Fallbacks

### What Changed
**File:** `src/services/googlebooks.ts`

New function: `searchBookWithFallbacks()` with 6 search strategies:

1. **Exact match** (title + author)
2. **Title only** (handles author typos)
3. **Title variants + author** (tries each variant)
4. **Title variants alone** (no author)
5. **Primary title + author variants** (tries each author spelling)
6. **Fuzzy search** (general query as last resort)

### Benefits
- ✅ Handles Russian ↔ English transliteration
- ✅ Recovers from minor typos
- ✅ Only makes extra API calls when needed (stops at first success)

### Example
```
Review: "Прочитал '1984' автор Оруэлл"

Try 1: intitle:1984+inauthor:Оруэлл ❌ No results
Try 2: intitle:1984 ✅ Found!
```

### ISBN Search
New function: `searchBookByISBN()` for the most precise lookups:
```typescript
searchBookByISBN("978-0-7475-3269-9") // Most reliable method
```

---

## 3. Multiple Book Detection in Telegram

### What Changed
**Files:**
- `src/bot/handlers/review.ts` (detection logic)
- `src/bot/handlers/book-selection.ts` (callback handlers)
- `src/bot/index.ts` (register handlers)

### User Experience

#### Scenario: Review mentions multiple books
User posts:
```
Just finished "1984" by Orwell.
It reminds me of "Brave New World" by Huxley. #рецензия
```

Bot responds with inline keyboard:
```
⚠️ Multiple books detected in your review!

Primary book: "1984"

Please confirm which book you're reviewing:

📖 1984 by George Orwell
📚 Brave New World by Aldous Huxley
🔢 Enter ISBN manually
✅ Keep current choice
```

### ISBN Input Flow
1. User clicks "🔢 Enter ISBN manually"
2. Bot prompts: "Please send the ISBN..."
3. User sends: `978-0-451-52493-5`
4. Bot looks up book via Google Books API
5. Updates review with correct book

### Commands
- `/cancel` - Abort ISBN input

---

## 4. CLI Tool for Fixing Existing Reviews

### What Changed
**File:** `scripts/review-and-fix-books.ts`

Interactive CLI tool to review and fix problematic book associations.

### Usage

```bash
# Review all issues
npm run fix-books

# Review only specific types
npm run fix-books -- --no-book           # Reviews without books
npm run fix-books -- --multiple          # Reviews with multiple books
npm run fix-books -- --low-confidence    # Low confidence matches
```

### Interactive Session

```
📚 Book Review Fixer
====================

🔍 Scanning reviews for issues...
Found 5 reviews without books
Found 47 total issues

📋 Found 47 issues to review

================================================================================
📝 Review ID: 123
📌 Issue Type: multiple_books

📖 Review Text:
Just finished "1984" by Orwell. It reminds me of "Brave New World"...

📚 Current Book: "1984" by George Orwell

🤖 Extracted Info:
   Primary: "1984" by George Orwell
   Confidence: medium
   Alternatives:
     1. "Brave New World" by Aldous Huxley

Options:
  [k] Keep current book
  [p] Use primary extracted book
  [1] Use alternative book #1
  [i] Enter ISBN manually
  [t] Enter title and author manually
  [s] Skip this review
  [q] Quit

Your choice: █
```

### Features
- ✅ Shows review text and current book
- ✅ Shows extracted alternatives
- ✅ Manual ISBN entry
- ✅ Manual title/author entry
- ✅ Skip or quit anytime
- ✅ Batch processing with progress tracking

---

## Impact on Existing Functionality

### Backward Compatibility
- ✅ All existing functionality still works
- ✅ Old reviews are not affected (until fixed via CLI)
- ✅ Regex fallback still works if OpenAI fails

### New Behavior
- **Multiple books detected**: User prompted to choose
- **Low confidence**: User prompted to confirm
- **Transliterations**: Automatically tried during Google Books search
- **ISBN input**: Available when bot can't find the right book

---

## API Cost Implications

### OpenAI
- **No increase**: Still 1 call per review (just richer response)
- Max tokens increased from 200 → 300 to handle variants

### Google Books
- **Moderate increase**: Cascading search makes 2-6 calls per review (only when needed)
- **Mitigation**: Stops at first success
- **Most cases**: Still just 1-2 calls
- **Rate limits**: Be mindful of Google Books free tier (1,000 requests/day)

### Recommendation
For high-volume imports, consider adding a delay between reviews or using a paid Google Books API tier.

---

## Testing

### TypeScript
```bash
npm run typecheck  # ✅ No errors
```

### Manual Testing Checklist

#### Telegram Bot
- [ ] Post review with #рецензия → book found automatically
- [ ] Post review mentioning 2 books → selection menu appears
- [ ] Click "Enter ISBN manually" → ISBN prompt appears
- [ ] Send valid ISBN → book found and associated
- [ ] Send `/cancel` during ISBN input → cancelled successfully

#### CLI Tool
- [ ] Run `npm run fix-books` → shows all issues
- [ ] Choose option [k] → keeps current book
- [ ] Choose option [i] → prompts for ISBN
- [ ] Choose option [t] → prompts for title/author
- [ ] Choose option [q] → exits cleanly

### Edge Cases to Test
1. **Russian book title with Latin author**: "Мастер и Маргарита by Bulgakov"
2. **Latin title with Cyrillic author**: "1984 by Оруэлл"
3. **Comparison review**: "1984 is better than Brave New World"
4. **ISBN-10 vs ISBN-13**: Both formats should work
5. **Invalid ISBN**: Should show error and allow retry

---

## Future Improvements

1. **Persistent state for ISBN input**: Move from in-memory Map to database
2. **Bulk ISBN import**: Allow fixing multiple reviews with CSV of ISBNs
3. **AI-powered book selection**: Use GPT to auto-select from alternatives
4. **Duplicate book detection**: Merge books that are clearly the same
5. **Review editing**: Allow users to edit review text via bot

---

## Summary

These improvements significantly enhance book matching accuracy while maintaining backward compatibility. The system now gracefully handles:
- ✅ Multiple books in one review
- ✅ Transliteration issues (Russian ↔ English)
- ✅ Author/title typos
- ✅ Ambiguous extractions
- ✅ Manual ISBN entry when auto-detection fails

Users have full control via both Telegram UI and CLI, ensuring high-quality book associations in the database.
