# Google Books API Rate Limiting

This document explains how the Google Books API rate limiting works and how to configure it.

## Problem

Google Books API free tier has a limit of **1,000 requests per day**. When reprocessing 710 reviews with cascading fallback searches, you can easily hit this limit and get `429 Too Many Requests` errors.

## Solution

The codebase now includes automatic rate limiting and retry logic with exponential backoff.

---

## Features

### 1. **Automatic Rate Limiting**
**File:** `src/services/googlebooks.ts`

Every Google Books API request automatically waits between calls:
```typescript
const GOOGLE_BOOKS_DELAY_MS = 200; // Default: 200ms between requests
```

This means:
- **Maximum 5 requests per second**
- **300 requests per minute**
- **~18,000 requests per hour** (theoretical max)

### 2. **Exponential Backoff on 429 Errors**

When a `429` error occurs, the system automatically retries with increasing delays:

| Attempt | Backoff Time |
|---------|--------------|
| 1st retry | 1 second |
| 2nd retry | 2 seconds |
| 3rd retry | 4 seconds |

After 3 failed attempts, the request fails and propagates the error.

### 3. **Graceful Degradation**

When rate limits are hit:
- **Cascading searches stop** (prevents wasting remaining quota)
- **Error is logged** with clear message
- **Script shows helpful instructions** on how to continue

---

## Configuration

### Environment Variables

Add these to your `.env` file to customize rate limiting:

```bash
# Default values (shown)
GOOGLE_BOOKS_DELAY_MS=200        # Delay between requests (ms)
GOOGLE_BOOKS_MAX_RETRIES=3       # Max retries on 429 error
GOOGLE_BOOKS_BACKOFF_MS=1000     # Initial backoff time (ms)
```

### Recommended Settings

#### For Normal Operation (Telegram Bot)
```bash
GOOGLE_BOOKS_DELAY_MS=200
GOOGLE_BOOKS_MAX_RETRIES=3
```
**Good for:** Real-time review processing, won't impact user experience

#### For Bulk Reprocessing (Scripts)
```bash
GOOGLE_BOOKS_DELAY_MS=500
GOOGLE_BOOKS_MAX_RETRIES=5
GOOGLE_BOOKS_BACKOFF_MS=2000
```
**Good for:** Large batch processing, more conservative to avoid hitting limits

#### If You Keep Hitting Limits
```bash
GOOGLE_BOOKS_DELAY_MS=1000       # 1 request per second
GOOGLE_BOOKS_MAX_RETRIES=5
GOOGLE_BOOKS_BACKOFF_MS=5000     # Wait 5s, 10s, 20s on retries
```
**Good for:** When you're consistently hitting daily quotas

---

## How It Works

### Request Flow

```
┌─────────────────────────────────┐
│  Google Books API Request       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Wait for rate limit            │
│  (GOOGLE_BOOKS_DELAY_MS)        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Send HTTP request              │
└────────────┬────────────────────┘
             │
             ▼
         Response OK?
             │
    ┌────────┴────────┐
    │                 │
   Yes               429?
    │                 │
    ▼                 ▼
 Return        ┌──────────────────┐
 Result        │  Retry with      │
               │  Exponential     │
               │  Backoff         │
               └─────┬────────────┘
                     │
                Max retries hit?
                     │
                ┌────┴────┐
               Yes       No
                │         │
                ▼         ▼
              Throw    Try again
              Error
```

### Cascading Search with Rate Limiting

When searching with fallbacks:
```typescript
searchBookWithFallbacks(title, author, variants, authorVariants)
```

1. **Try 1:** Exact match (title + author) → Wait 200ms → Try
2. **Try 2:** Title only → Wait 200ms → Try
3. **Try 3:** Title variants + author → Wait 200ms each → Try
4. ... up to 6 search strategies

If any request returns `429`:
- Retry with backoff (1s, 2s, 4s)
- If still failing after retries → throw error
- Stop all remaining fallback attempts
- Return to caller with clear error message

---

## Handling Rate Limit Errors

### In Telegram Bot

When a user posts a review and Google Books is rate-limited:
1. Bot still works (uses regex fallback for book extraction)
2. Book is saved without Google Books metadata
3. No cover image, ISBN, or description
4. Admin gets notification (if configured)

**Fix later:** Run reprocessing script when quota resets

### In Reprocess Script

When reprocessing hits rate limit:

```
⚠️  Google Books rate limit hit at review 245/710

⚠️  Stopped early due to rate limit. Processed 245/710 reviews.

💡 To continue:
   1. Wait for rate limit to reset (usually 24 hours)
   2. Or set GOOGLE_BOOKS_DELAY_MS=500 in .env for slower processing
   3. Or use --can-improve filter to process smaller batches
```

**To resume:**
```bash
# Wait 24 hours, then run again (starts from beginning, skips processed)
npm run fix-books -- --reprocess --can-improve --auto-improve
```

---

## Monitoring Rate Limits

### Check Logs

When rate limits are hit, you'll see:
```
[Google Books] Rate limit hit (429). Retrying in 1000ms... (attempt 1/3)
[Google Books] Rate limit hit (429). Retrying in 2000ms... (attempt 2/3)
[Google Books] Rate limit exceeded after 3 retries
⚠️  Google Books rate limit hit at review 245/710
```

### Estimate Quota Usage

**For reprocessing 710 reviews:**

| Scenario | Requests per Review | Total Requests |
|----------|---------------------|----------------|
| Best case (all found on try 1) | 1-2 | ~1,000 |
| Average case (some fallbacks) | 2-3 | ~1,500 |
| Worst case (all 6 fallbacks) | 6 | ~4,200 |

**Conclusion:** With 1,000 request/day limit:
- ✅ Can process ~300-500 reviews per day safely
- ❌ Cannot process all 710 reviews in one day at default speed

### Solutions for Large Batches

**Option 1: Slow down requests**
```bash
GOOGLE_BOOKS_DELAY_MS=500  # ~120 requests/min → stay under daily limit
```

**Option 2: Process in batches**
```bash
# Day 1: Process first batch
npm run fix-books -- --reprocess --can-improve --auto-improve

# Day 2: Process next batch (continues from where it left off)
npm run fix-books -- --reprocess --can-improve --auto-improve
```

**Option 3: Get paid Google Books API**
- Unlimited requests
- Higher rate limits
- See: https://developers.google.com/books/docs/v1/using

---

## Best Practices

### 1. Test with Small Batches First
```bash
npm run fix-books -- --reprocess --can-improve
# Review manually instead of --auto-improve
# Stop after 50-100 reviews to check quota usage
```

### 2. Schedule Reprocessing Overnight
```bash
# Run at night when bot traffic is low
0 2 * * * cd /path/to/bot && npm run fix-books -- --reprocess --auto-improve
```

### 3. Use Filters to Prioritize
```bash
# Process only books missing metadata (highest value)
npm run fix-books -- --reprocess --can-improve --auto-improve
```

### 4. Monitor Quota
Check Google Cloud Console:
- Go to: https://console.cloud.google.com/apis/api/books.googleapis.com
- View: Metrics → Requests
- Set up: Alerts for approaching daily limit

---

## Troubleshooting

### "Rate limit exceeded after 3 retries"

**Cause:** Hit daily quota (1,000 requests)

**Solution:**
1. Wait 24 hours for quota to reset
2. Or increase `GOOGLE_BOOKS_DELAY_MS` to slow down future runs
3. Or use paid API tier

### "Google Books API error: 429" (but no retries)

**Cause:** Old code without retry logic

**Solution:** Make sure you're running latest code with retry logic

### Script processes very slowly

**Cause:** High `GOOGLE_BOOKS_DELAY_MS` setting

**Check:** Current setting in `.env` or default (200ms)

**Adjust:**
```bash
# Faster (riskier)
GOOGLE_BOOKS_DELAY_MS=100

# Slower (safer)
GOOGLE_BOOKS_DELAY_MS=500
```

### Want to disable rate limiting (testing only)

```bash
GOOGLE_BOOKS_DELAY_MS=0         # No delay (not recommended!)
GOOGLE_BOOKS_MAX_RETRIES=0      # No retries (will fail fast on 429)
```

**Warning:** Only use for testing! Will quickly exhaust quota.

---

## Summary

The Google Books API rate limiting system now:
- ✅ Automatically waits between requests (200ms default)
- ✅ Retries with exponential backoff on 429 errors (3 retries default)
- ✅ Stops gracefully when quota exhausted
- ✅ Fully configurable via environment variables
- ✅ Works for both real-time bot and batch reprocessing

**Default settings work well for normal bot operation. Increase delays for bulk reprocessing to avoid hitting daily limits.**
