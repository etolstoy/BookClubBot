# Review Evaluation Case Collection - Technical Specification

## Overview

Automatically collect problematic book extraction cases from production to build an evaluation dataset for improving the book extraction service quality.

## Objectives

1. Identify and log cases where book extraction failed or had insufficient confidence
2. Collect cases at creation time (not waiting for user corrections)
3. Store in simple log files for manual review and labeling later
4. Maintain user privacy through anonymization
5. Operate transparently without impacting user experience
6. Enable easy removal or disabling of the feature

## Architectural Isolation

**Critical Design Principle**: This feature must be fully isolated from other code to enable easy disabling or removal.

### Isolation Constraints

1. **Single Entry Point**: Only one call site in `src/bot/handlers/review.ts`
2. **No Database Dependencies**: File-based storage only, no Prisma/DB operations
3. **Fire-and-Forget Pattern**: Non-blocking async calls, failures don't propagate
4. **Minimal Service Dependencies**: Only notification service for alerting (acceptable coupling)
5. **Self-Contained Logic**: All functionality in single service file

### Disabling the Feature

To disable: Comment out the `logOrphanedReviewCase()` call in `review.ts`. Single line change.

### Removing the Feature

To remove completely:
1. Delete `src/services/review-eval-case-logger.service.ts`
2. Remove import and call site from `review.ts`
3. Delete `data/review-eval-cases/` directory (optional)

## Versioning Strategy

Track extraction algorithm versions to enable A/B testing and historical analysis.

### Version Management

**Environment Variable**: `EXTRACTION_VERSION` (default: `v1`)

Cases are stored in version-specific subdirectories:
```
data/review-eval-cases/
  v1/
    2026-01.md
    2026-02.md
  v2/
    2026-03.md
```

### When to Bump Versions

Create a new version when making significant extraction algorithm changes:
- Switching LLM providers (OpenAI → Anthropic)
- Major prompt rewrites
- Changing extraction logic (adding/removing fallback steps)
- Model upgrades that change behavior significantly

**Minor changes** (prompt tweaks, parameter tuning) don't require new versions.

### Transition Process

1. Set `EXTRACTION_VERSION=v2` in environment
2. Deploy updated extraction code
3. New cases automatically go to `v2/` subdirectory
4. Old `v1/` cases remain for historical comparison

## Current Review Import Flow (Context)

### Automatic Import Based on Confidence

1. **User submits review**: Posts message with `#рецензия` hashtag or uses `/review` command
2. **Bot adds 👀 reaction**: Indicates processing has started
3. **LLM extraction**: Extracts book info (title, author) with confidence score (high/medium/low)
4. **Confidence-based branching**:
   - **HIGH confidence**: Book enrichment, create review with book link
   - **LOW/MEDIUM confidence OR extraction failed**: Create **orphaned review** (bookId = null) → **THIS IS THE COLLECTION TRIGGER**
5. **Bot adds 👍 reaction**: Indicates success

## Collection Criteria

### Single Collection Trigger: Orphaned Review Creation

Collect cases when a review is created **WITHOUT a book link** (bookId = null).

**What this captures:**
- Low/medium confidence extractions
- Complete extraction failures (null title/author)
- All cases where automatic extraction didn't work well enough

**Timing**: Immediately AFTER orphaned review is successfully created in database

**Non-blocking**: Fire-and-forget async logging - failures don't impact review creation

## Data Schema

### Storage Format: Markdown Log Files

**Location**: `data/review-eval-cases/$EXTRACTION_VERSION/` (e.g., `data/review-eval-cases/v1/`)

**File naming**: `YYYY-MM.md` (e.g., `2026-01.md`)

**Rotation**: Monthly (new file each month, automatically created on first write)

### Case Entry Format

```markdown
## Case #123 - 2026-01-15 14:32:18

**Review Text:**
```
[Full review text here, preserving original formatting]
```

**Extraction Results:**
- **Title:** "Мастер и Маргарита" (or `null` if extraction failed)
- **Author:** "М. А. Булгаков" (or `null` if extraction failed)
- **Confidence:** low (or `medium`, or `null` for complete failure)

**Collected At:** 2026-01-15T14:32:18Z

---
```

**Case ID Format**: `YYYY-MM#N` (e.g., `2026-01#123`) - month resets numbering

### What We Store

| Field | Description | Example |
|-------|-------------|---------|
| Case Number | Sequential number within the month | `#123` |
| Timestamp | When case was collected (ISO 8601, UTC) | `2026-01-15T14:32:18Z` |
| Review Text | Full review message text | Full text block |
| Extracted Title | Title extracted by LLM, or "null" | `"The Great Gatsby"` or `null` |
| Extracted Author | Author extracted by LLM, or "null" | `"F. Scott Fitzgerald"` or `null` |
| Extraction Confidence | Confidence level from LLM | `low`, `medium`, or `null` |

### What We DON'T Store (Privacy)

- ❌ Telegram user ID
- ❌ Telegram username
- ❌ Telegram display name
- ❌ Message ID
- ❌ Chat ID
- ❌ Review ID (database ID)
- ❌ Any user identifiers

**Rationale**: Full anonymization. Review text is sufficient for evaluation. No way to correlate cases back to users, even if database is compromised.

## Implementation

### Service File Structure

**File**: `src/services/review-eval-case-logger.service.ts`

**Key Functions**:
- `logOrphanedReviewCase()`: Main entry point (fire-and-forget async)
- `getCurrentLogFilePath()`: Returns version-aware path based on `EXTRACTION_VERSION`
- `getNextCaseNumber()`: Reads file, finds max case number (tolerates gaps/duplicates)
- `formatCaseEntry()`: Formats markdown without escaping (trust user input)
- `getLogStats()`: Returns file count and case count for monitoring

### Implementation Details

**Async Pattern**: Fire-and-forget (call without `await` in review.ts)
```typescript
// In review.ts - don't await, failures are silent
logOrphanedReviewCase({ ... }).catch(err =>
  console.error('[Review] Failed to log eval case:', err)
);
```

**Concurrency**: Accept duplicate case numbers if concurrent writes occur (rare, tolerable)

**Character Encoding**: Trust Node.js defaults (UTF-8), no explicit encoding

**Markdown Escaping**: No escaping of review text (trust users, wrap in code fences)

**Directory Creation**: Lazy initialization on first write (mkdirSync with recursive: true)

### Startup Validation

Add permission check at app startup to catch issues early:

```typescript
// In src/index.ts or similar startup file
async function validateEvalCaseLogging() {
  try {
    const testDir = path.join('data', 'review-eval-cases', process.env.EXTRACTION_VERSION || 'v1');
    await fs.promises.mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, '.writetest');
    await fs.promises.writeFile(testFile, 'test', 'utf-8');
    await fs.promises.unlink(testFile);
    console.log('[Startup] Eval case logging directory is writable');
  } catch (error) {
    console.warn('[Startup] Eval case logging directory not writable:', error);
    // Don't fail startup, just warn
  }
}
```

### Integration with Review Handler

**File**: `src/bot/handlers/review.ts`

**Integration Point** (after review creation):

```typescript
// After review is created successfully
if (bookId === null) {
  // Fire-and-forget: don't await, catch errors
  logOrphanedReviewCase({
    reviewText: messageText,
    extractedTitle: extractedInfo?.title ?? null,
    extractedAuthor: extractedInfo?.author ?? null,
    extractionConfidence: extractedInfo?.confidence ?? null,
  }).catch(error => {
    console.error('[Review] Failed to log eval case:', error);
    // Don't throw - review creation already succeeded
  });
}
```

## Failure Alerting

Track persistent logging failures and alert admins via notification service.

### Sliding Window Failure Tracking

**In-memory tracking**: Array of failure timestamps, resets on app restart (acceptable)

**Alert threshold**: 3+ failures within 60 minutes

**Implementation**:
```typescript
const failureTimestamps: number[] = [];

function trackFailure() {
  const now = Date.now();
  failureTimestamps.push(now);

  // Keep only last 60 minutes
  const oneHourAgo = now - 60 * 60 * 1000;
  while (failureTimestamps.length > 0 && failureTimestamps[0] < oneHourAgo) {
    failureTimestamps.shift();
  }

  // Alert if threshold exceeded
  if (failureTimestamps.length >= 3) {
    sendAdminNotification(
      '⚠️ Eval Case Logging Failures',
      `Logging failed ${failureTimestamps.length} times in the last hour.\n` +
      `Last error: ${lastError?.message || 'Unknown'}`
    );
    // Reset to avoid spam
    failureTimestamps.length = 0;
  }
}
```

**Error Diagnostics**: Include last N error messages in notification for debugging

**Notification Integration**: Import and use existing `sendAdminNotification()` from notification service

## Configuration

**Required Environment Variables**: None (works with defaults)

**Optional Environment Variables**:

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTRACTION_VERSION` | `v1` | Version subdirectory for case files |

**Log Location**: `data/review-eval-cases/$EXTRACTION_VERSION/`

**Rationale**: No configuration needed for core functionality. Version tracking is opt-in.

## Data Access & Manual Labeling

### Accessing Log Files

```bash
# View current month's cases
cat data/review-eval-cases/v1/2026-01.md

# Count cases
grep -c "## Case #" data/review-eval-cases/v1/*.md

# Search for terms
grep -A 10 "Мастер" data/review-eval-cases/v1/*.md
```

### Manual Labeling Workflow

1. Open monthly log file in editor
2. Manually determine correct book for each case
3. Export to structured format (JSON/CSV) for eval dataset
4. Use labeled dataset to test and improve extraction algorithm

**Export Implementation**: Out of scope (YAGNI - implement when needed)

## Testing Strategy

### Integration Tests Only

**File**: `test/integration/review-eval-case.test.ts`

Use real filesystem (temp directory) for realistic testing:

```typescript
describe('Review Eval Case Integration', () => {
  test('orphaned review triggers case logging', async () => {
    // Create orphaned review → verify log file exists with correct format
  });

  test('high confidence review does NOT trigger logging', async () => {
    // Create high-confidence review → verify no log file created
  });

  test('review creation succeeds even if logging fails', async () => {
    // Mock fs errors → verify review still created
  });

  test('multiple orphaned reviews get sequential case numbers', async () => {
    // Create multiple orphaned reviews → verify numbering
  });

  test('monthly rotation creates separate files', async () => {
    // Simulate month change → verify separate files
  });

  test('version subdirectories work correctly', async () => {
    // Change EXTRACTION_VERSION → verify subdirectory usage
  });
});
```

**No unit tests**: File operations are simple, integration tests provide sufficient coverage

## Privacy & Data Protection

### Anonymization

**NOT stored**: User IDs, usernames, message IDs, chat IDs, review IDs

**Stored**: Review text only (necessary for extraction evaluation)

### Review Text Storage Justification

- Necessary to improve extraction algorithm
- Reviews are semi-public (posted in chat)
- Content is about books, not personal matters
- No user identifiers linked to text

### Export Anonymization

When sharing cases: Only include review text and extraction results. No IDs.

## Data Retention

**Keep Forever** - No automatic cleanup

**Rationale**:
- Valuable training data
- Storage is cheap (~100 KB/month)
- Historical data enables improvement tracking

## Success Criteria

### Functional Requirements
- ✅ Orphaned reviews logged to monthly markdown files
- ✅ Case numbers increment within month (gaps tolerated)
- ✅ Null extraction values handled correctly
- ✅ Monthly rotation works
- ✅ Review creation never fails due to logging
- ✅ No user identifiers stored
- ✅ Version subdirectories work correctly

### Non-Functional Requirements
- ✅ Non-blocking (fire-and-forget async)
- ✅ Human-readable log format
- ✅ Minimal storage (<1 MB/year)
- ✅ Isolated from other code

### Monitoring
- ✅ Success logs: `[EvalCase] Logged orphaned review case #X`
- ✅ Failure alerts to admin chat after 3+ failures/hour
- ✅ Startup validation logs directory writeability

## Key Design Decisions Summary

1. **Architectural Isolation**: Single entry point, no DB dependencies, easy to remove
2. **Storage**: File-based (not database) - simple, human-readable, no migrations
3. **Privacy**: No user identifiers - full anonymization even for debugging
4. **Versioning**: Environment variable for version subdirectories
5. **Async Pattern**: Fire-and-forget - non-blocking, silent failures
6. **Concurrency**: Accept duplicate case numbers - pragmatic simplicity
7. **Error Handling**: Non-blocking + sliding window alerts
8. **Testing**: Integration tests only - sufficient for file operations
9. **Scope**: Collection only - labeling and eval loops are future work

## Future Enhancements (Not in Scope)

- Admin API endpoints for stats
- Automated export to JSON
- Web UI for labeling
- Eval pipeline integration
- Confidence calibration metrics
- A/B testing framework
