# Review Reprocessing Guide

This guide explains how to re-process existing reviews with the new enhanced book matching logic.

## Why Reprocess?

After implementing the enhanced book matching system (variants, cascading fallbacks, multiple book detection), you can improve existing reviews that were imported with the old logic.

The reprocessing tool will:
- ✅ Re-extract book info using the new OpenAI prompt (with variants)
- ✅ Try cascading Google Books searches with variants
- ✅ Add missing Google Books metadata (covers, ISBNs, descriptions)
- ✅ Detect reviews that mention multiple books
- ✅ Find better book matches

---

## Commands

### 1. **Review All Issues** (Default)
```bash
npm run fix-books
```
Shows issues in a **limited batch** (100 reviews):
- Reviews without books
- Reviews with multiple books detected
- Reviews with low confidence matches

### 2. **Reprocess ALL Reviews**
```bash
npm run fix-books -- --reprocess
```
Re-processes **ALL reviews in the database** (no limit):
- Re-extracts book info with new logic
- Checks if each book can be improved
- Flags issues like:
  - Missing Google Books metadata
  - Better book match available
  - Multiple books detected
  - Different book extracted

**⚠️ Note:** This will take a while with 710 reviews (~1-2 hours with rate limiting)

### 3. **Auto-Improve Mode**
```bash
npm run fix-books -- --reprocess --auto-improve
```
Automatically updates books that can be improved:
- Books without Google Books metadata → adds it via cascading search
- Shows progress and summary
- Skips manual review for clear improvements
- Still prompts for ambiguous cases (multiple books, different titles)

### 4. **Filter by Issue Type**
```bash
# Only reviews without books
npm run fix-books -- --reprocess --no-book

# Only multiple books detected
npm run fix-books -- --reprocess --multiple

# Only low confidence matches
npm run fix-books -- --reprocess --low-confidence

# Only books that can be improved
npm run fix-books -- --reprocess --can-improve

# Auto-improve only the improvable ones
npm run fix-books -- --reprocess --can-improve --auto-improve
```

---

## Recommended Workflow

### Step 1: Analyze Issues (Dry Run)
```bash
npm run fix-books -- --reprocess
```
This will:
1. Re-extract all 710 reviews (~10 minutes)
2. Show summary of issues found
3. Let you review issues one by one

**Example output:**
```
🔍 Scanning reviews for issues...

Found 0 reviews without books
Analyzing 710 reviews with books...
  Progress: 10/710...
  Progress: 20/710...
  ...

Found 127 total issues

📋 Found 127 issues to review

================================================================================
📝 Review ID: 45
📌 Issue Type: can_improve

📖 Review Text:
Прочитал "1984" by Оруэлл. Отличная антиутопия...

📚 Current Book: "1984"
   ⚠️  No Google Books metadata

💡 Improvement: Can add Google Books metadata (cover, ISBN, description)

🤖 Extracted Info:
   Primary: "1984" by George Orwell
   Confidence: high

Options:
  [k] Keep current book
  [p] Use primary extracted book (with new cascading search)
  [i] Enter ISBN manually
  [t] Enter title and author manually
  [s] Skip this review
  [q] Quit

Your choice: █
```

### Step 2: Auto-Improve Clear Cases
```bash
npm run fix-books -- --reprocess --can-improve --auto-improve
```
This will:
1. Show summary of improvable books
2. Ask for confirmation
3. Automatically update all books that can be improved
4. Show progress

**Example output:**
```
🔄 REPROCESS MODE: Re-extracting all reviews with new logic
🤖 AUTO-IMPROVE MODE: Automatically updating improvable books

📊 Summary:
   Total issues: 127
   Auto-improvable: 89
   Requires manual review: 38

Continue with auto-improvement? [Y/n]: Y

================================================================================
📝 Review ID: 45
📌 Issue Type: can_improve
...
🤖 Auto-improvement mode enabled. Updating book...
✅ Auto-updated to: "1984" by George Orwell
   ✨ Now has Google Books metadata

...
(continues automatically for all improvable books)

✅ Summary:
   Processed: 89/89
   Fixed: 89
   Auto-improved: 89
```

### Step 3: Manually Review Complex Cases
```bash
npm run fix-books -- --reprocess --multiple
npm run fix-books -- --reprocess --low-confidence
```
Review and fix:
- Reviews mentioning multiple books
- Low confidence extractions
- Cases where extracted book differs from current

---

## What Gets Improved?

### 1. **Missing Google Books Metadata**
**Before:**
```
Book: "1984"
Author: Оруэлл
Google Books ID: null
Cover: null
ISBN: null
```

**After (with cascading search):**
```
Book: "1984"
Author: George Orwell
Google Books ID: "abc123xyz"
Cover: https://books.google.com/covers/...
ISBN: 978-0-452-28423-4
Description: A dystopian novel...
```

### 2. **Better Title/Author Extraction**
**Before (old extraction):**
```
Extracted: "1984"
Author: null
```

**After (new extraction with variants):**
```
Extracted: "1984"
Author: George Orwell
Variants: ["Nineteen Eighty-Four"]
Author Variants: ["Orwell", "Оруэлл", "G. Orwell"]
```

### 3. **Multiple Books Detected**
**Before:**
```
Review: "1984 is better than Brave New World"
Book: "1984" (randomly picked first one)
```

**After:**
```
Review: "1984 is better than Brave New World"
Detected:
  - Primary: "1984" by George Orwell
  - Alternative: "Brave New World" by Aldous Huxley
Prompt user to choose which book is being reviewed
```

---

## Safety & Best Practices

### 1. **Start Small**
Test on a filtered subset first:
```bash
npm run fix-books -- --reprocess --can-improve --auto-improve
```
Only auto-improves clear cases (adding metadata).

### 2. **Backup Your Database**
```bash
cp data/bookclub.db data/bookclub.db.backup
```

### 3. **Review Changes**
After auto-improvement, check a few books:
```bash
npx prisma studio
```

### 4. **Rate Limiting**
The script includes 100ms delays between reviews to avoid:
- OpenAI rate limits
- Google Books rate limits

Adjust in code if needed:
```typescript
// scripts/review-and-fix-books.ts:114
await new Promise(resolve => setTimeout(resolve, 100)); // Increase if needed
```

### 5. **Resume Capability**
If interrupted, run again:
- `--can-improve` filter skips already improved books
- Duplicate detection prevents double-processing

---

## Performance Estimates

**For 710 reviews:**

| Mode | Time | API Calls |
|------|------|-----------|
| Standard scan | ~5 min | 710 OpenAI |
| Reprocess | ~15 min | 710 OpenAI + ~200 Google Books |
| Reprocess + Auto-improve | ~20 min | 710 OpenAI + ~400 Google Books |

**API Costs (approximate):**
- OpenAI (gpt-4o-mini): $0.07 for 710 reviews
- Google Books: Free (1,000 requests/day limit)

---

## Troubleshooting

### "Rate limit exceeded"
**OpenAI:**
```
Error: 429 rate_limit_exceeded
```
→ Increase delay or use slower model

**Google Books:**
```
Google Books API error: 429
```
→ Hit daily limit (1,000 requests), wait 24h or upgrade to paid tier

### "Out of memory"
Processing 710 reviews at once:
→ Add `--can-improve` filter to process in batches

### "No improvements found"
All books already have Google Books metadata:
→ Great! Nothing to improve.

---

## Example Session

```bash
$ npm run fix-books -- --reprocess --can-improve --auto-improve

📚 Book Review Fixer & Reprocessor
===================================

🔄 REPROCESS MODE: Re-extracting all reviews with new logic
🤖 AUTO-IMPROVE MODE: Automatically updating improvable books

🔍 Scanning reviews for issues...

Found 0 reviews without books
Analyzing 710 reviews with books...
  Progress: 10/710...
  Progress: 20/710...
  ...
  Progress: 710/710...

Found 89 total issues

📋 Found 89 issues to review

📊 Summary:
   Total issues: 89
   Auto-improvable: 89
   Requires manual review: 0

Continue with auto-improvement? [Y/n]: Y

[Processes all 89 improvements automatically]

✅ Summary:
   Processed: 89/89
   Fixed: 89
   Auto-improved: 89

$ # Now check the results
$ npx prisma studio
```

---

## Summary

The reprocessing tool gives you powerful options to improve your existing book associations:

1. **Analyze**: See what can be improved
2. **Auto-improve**: Let the system fix clear cases
3. **Manual review**: Handle complex/ambiguous cases

Start with `--reprocess --can-improve --auto-improve` for the best quick wins!
