# Review Evaluation Case Logging

## Overview

Automated collection system that logs problematic book extraction cases (orphaned reviews) to markdown files. This creates a dataset for evaluating and improving the book extraction algorithm.

## Purpose

When the bot fails to extract book information with high confidence, these "orphaned reviews" (reviews without a linked book) are valuable for:

1. **Evaluation dataset building**: Ground truth for testing extraction improvements
2. **Algorithm debugging**: Understand where and why extraction fails
3. **A/B testing**: Compare different extraction algorithms (v1 vs v2)
4. **Historical analysis**: Track extraction quality over time

## Architecture

### Design Principles

- **Architectural isolation**: Single call site, no database changes, easy to disable/remove
- **Fire-and-forget**: Non-blocking, never impacts review processing
- **Version isolation**: Support A/B testing with separate subdirectories
- **Pragmatic concurrency**: Accept rare duplicate case numbers as acceptable trade-off

### File Organization

```
data/review-eval-cases/
├── v1/
│   ├── 2026-01.md
│   ├── 2026-02.md
│   └── 2026-03.md
└── v2/
    ├── 2026-01.md
    └── 2026-02.md
```

- **Version subdirectories**: Isolate cases by extraction algorithm version
- **Monthly rotation**: Separate files per month (`YYYY-MM.md`)
- **Markdown format**: Human-readable, easy to review and annotate

## Configuration

### Environment Variable

Set in `.env`:

```bash
EXTRACTION_VERSION=v1  # Default: v1
```

### Changing Versions

To test a new extraction algorithm:

1. Deploy new extraction code
2. Set `EXTRACTION_VERSION=v2` in `.env`
3. Restart bot
4. New orphaned reviews log to `data/review-eval-cases/v2/`
5. Old v1 cases remain untouched for comparison

## When Cases Are Logged

A case is logged when a review is created as "orphaned" (without a linked book):

- ✅ Extraction confidence is `low` or `medium`
- ✅ Extraction completely failed (null title/author/confidence)
- ❌ Extraction confidence is `high` (review linked to book)

## Log Format

Each case is a markdown entry:

```markdown
## Case #123 - 2026-01-15 14:32:18

**Review Text:**
\`\`\`
The actual review text here, wrapped in code fence
No escaping needed, preserves original formatting
\`\`\`

**Extraction Results:**
- **Title:** "Extracted Title" (or null if extraction failed)
- **Author:** "Extracted Author" (or null if extraction failed)
- **Confidence:** low/medium/null

**Collected At:** 2026-01-15T14:32:18.000Z

---
```

### Case Numbering

- Sequential per file: #1, #2, #3, ...
- Determined by reading file and finding max case number + 1
- **Note**: Rare race conditions can cause duplicate numbers (acceptable trade-off)

## Usage

### Programmatic Access

```typescript
import {
  logOrphanedReviewCase,
  getLogStats,
  getCurrentLogFilePath,
} from "./services/review-eval-case-logger.service.js";

// Log a case (fire-and-forget, never throws)
await logOrphanedReviewCase({
  reviewText: "Review text here",
  extractedTitle: "Book Title",
  extractedAuthor: "Author Name",
  extractionConfidence: "low",
});

// Get statistics
const stats = await getLogStats();
// { version: "v1", fileCount: 3, totalCases: 42 }

// Get current log file path
const filePath = getCurrentLogFilePath();
// "data/review-eval-cases/v1/2026-01.md"
```

### Manual Testing

Run the test script:

```bash
npx tsx scripts/test-eval-case-logging.ts
```

This creates sample cases and displays statistics.

## Monitoring

### Startup Validation

On bot startup, the system validates the log directory is writable:

```
[Startup] Eval case logging directory is writable (version: v1)
```

If directory is not writable:

```
[Startup] WARNING: Eval case logging directory not writable: Error: EACCES
[Startup] Review processing will continue, but eval cases won't be logged
```

**Important**: Bot continues to run normally even if validation fails.

### Success Logs

When a case is logged successfully:

```
[EvalCase] Logged orphaned review case #42 to data/review-eval-cases/v1/2026-01.md
```

### Failure Logs

When logging fails (error caught, review processing continues):

```
[EvalCase] Failed to log orphaned review case: Error: EACCES: permission denied
```

### Failure Alerting

The system tracks failures using a sliding window (60 minutes). After 3 failures:

- Admin chat receives warning notification
- Alert includes failure count and last error message
- Review processing continues normally

Example notification:

```
⚠️ Warning

Review evaluation case logging has failed 3 times in the last hour.
Review processing continues normally, but eval cases are not being logged.
Last error: EACCES: permission denied, open 'data/review-eval-cases/v1/2026-01.md'
```

Alert resets when failures drop below threshold or window expires.

## Error Handling

### Fire-and-Forget Architecture

```typescript
// In review.ts (line 272)
logOrphanedReviewCase({
  reviewText: messageText,
  extractedTitle: extractedInfo?.title ?? null,
  extractedAuthor: extractedInfo?.author ?? null,
  extractionConfidence: extractedInfo?.confidence ?? null,
}).catch((error) => {
  console.error("[Review] Failed to log eval case:", error);
});
```

- **No `await`**: Non-blocking, review creation continues immediately
- **`.catch()`**: Prevents error propagation to review handler
- **Never throws**: All errors caught within service

### What Happens on Failure

1. Error is caught and logged to console
2. Failure is tracked in sliding window
3. If threshold exceeded (3 in 60 min), admin notification sent
4. **Review processing continues normally**
5. User sees no error

## Disabling the Feature

### Temporary Disable

Comment out line 272 in `src/bot/handlers/review.ts`:

```typescript
// logOrphanedReviewCase({ ... }).catch(...);
```

Rebuild and restart bot.

### Permanent Removal

1. Delete `src/services/review-eval-case-logger.service.ts`
2. Remove import and call from `src/bot/handlers/review.ts`
3. Remove `EXTRACTION_VERSION` from `src/lib/config.ts`
4. Remove `validateEvalCaseLogging()` from `src/index.ts`
5. Delete `data/review-eval-cases/` directory
6. Delete `test/integration/review-eval-case.test.ts`

## Statistics API

### Get Log Statistics

```typescript
const stats = await getLogStats();
```

Returns:

```typescript
{
  version: string,      // Current extraction version
  fileCount: number,    // Number of log files
  totalCases: number    // Total cases across all files
}
```

Example:

```typescript
{
  version: "v1",
  fileCount: 3,         // 2026-01.md, 2026-02.md, 2026-03.md
  totalCases: 127       // Total cases logged
}
```

## Testing

### Integration Tests

Run all tests:

```bash
npm test -- review-eval-case.test.ts
```

Test coverage:
- ✅ Log file creation with correct format
- ✅ Null extraction values handling
- ✅ Sequential case numbering
- ✅ Monthly rotation
- ✅ Version isolation
- ✅ Statistics calculation
- ✅ Failure alerting
- ✅ Case number calculation
- ✅ Entry formatting

### Manual Testing

1. **Test orphaned review creation:**
   ```bash
   npx tsx scripts/test-eval-case-logging.ts
   ```

2. **Verify log file:**
   ```bash
   cat data/review-eval-cases/v1/$(date +%Y-%m).md
   ```

3. **Check statistics:**
   ```bash
   ls -l data/review-eval-cases/v1/
   ```

## Performance Considerations

### Synchronous File Operations

The service uses synchronous file operations (`fs.readFileSync`, `fs.appendFileSync`) for simplicity:

- **Trade-off**: Simpler code, rare duplicate case numbers
- **Rationale**: Fire-and-forget architecture means no blocking
- **Impact**: Negligible (orphaned reviews are rare, operations are fast)

### Concurrency

No locking mechanism:

- **Race condition**: Multiple simultaneous logs can get duplicate case numbers
- **Frequency**: Very rare (requires exact timing of multiple orphaned reviews)
- **Impact**: Tolerable (case numbers are for human reference, not critical)

## Backup and Maintenance

### Backup

Log files are plain markdown:

```bash
# Backup all versions
tar -czf review-eval-cases-backup-$(date +%Y%m%d).tar.gz data/review-eval-cases/
```

### Archival

After analysis, move old files to archive:

```bash
mkdir -p data/review-eval-cases-archive/v1
mv data/review-eval-cases/v1/2025-*.md data/review-eval-cases-archive/v1/
```

### Cleanup

Delete analyzed cases:

```bash
rm data/review-eval-cases/v1/2025-*.md
```

**Note**: Keep at least one month of recent data for reference.

## Use Cases

### 1. Building Evaluation Dataset

Collect ground truth for testing extraction improvements:

1. Review logged cases manually
2. Annotate correct book information
3. Create test dataset from annotated cases
4. Use dataset to benchmark extraction algorithms

### 2. Algorithm Debugging

Identify extraction failure patterns:

```bash
# Find all null extractions
grep -B 2 "Title: null" data/review-eval-cases/v1/*.md

# Find low confidence cases
grep -B 2 "Confidence: low" data/review-eval-cases/v1/*.md
```

### 3. A/B Testing

Compare extraction algorithms:

1. Deploy v1, let it run for a month
2. Deploy v2 with `EXTRACTION_VERSION=v2`
3. Compare statistics:
   ```bash
   find data/review-eval-cases/v1/ -name "*.md" -exec wc -l {} + | tail -1
   find data/review-eval-cases/v2/ -name "*.md" -exec wc -l {} + | tail -1
   ```
4. If v2 has fewer cases, it's better at extraction

### 4. Historical Analysis

Track extraction quality over time:

```bash
# Cases per month
for file in data/review-eval-cases/v1/*.md; do
  count=$(grep -c "^## Case #" "$file")
  echo "$(basename $file): $count cases"
done
```

## Troubleshooting

### "Directory not writable" warning on startup

**Cause**: Insufficient permissions or disk space

**Solution**:
```bash
chmod 755 data/review-eval-cases/v1
# or
df -h  # Check disk space
```

**Impact**: Review processing continues normally, cases not logged

### Cases not appearing in log files

**Check**:
1. Verify `EXTRACTION_VERSION` in `.env`
2. Check console for `[EvalCase]` logs
3. Verify orphaned reviews are being created (check database)
4. Look for failure logs

**Debug**:
```bash
# Check if directory exists
ls -la data/review-eval-cases/

# Check permissions
ls -la data/review-eval-cases/v1/

# Check recent logs
grep "\[EvalCase\]" logs/bot.log | tail -20
```

### Duplicate case numbers

**Cause**: Race condition (simultaneous orphaned reviews)

**Solution**: Not a problem, tolerable by design

**Workaround**: If needed, manually renumber cases in markdown file

### High failure rate (many admin alerts)

**Investigate**:
1. Check disk space: `df -h`
2. Check permissions: `ls -la data/review-eval-cases/`
3. Check system logs for I/O errors
4. Monitor for concurrent write conflicts

**Temporary fix**: Disable feature until issue resolved

## Security Considerations

### No Markdown Escaping

Review text is wrapped in code fences without escaping:

```markdown
\`\`\`
User review text here (no escaping)
\`\`\`
```

**Rationale**: Trust user input, simpler implementation

**Risk**: Low (markdown files are for internal review only)

**Mitigation**: Don't serve log files publicly

### File System Access

Service writes to `data/review-eval-cases/`:

- **Permissions**: Should be restricted to bot process user
- **Location**: Outside web-accessible directories
- **Backup**: Include in regular backup process

## Future Enhancements

Potential improvements (not currently implemented):

1. **JSON output**: Machine-readable format for automated analysis
2. **Compression**: Gzip old log files to save space
3. **Database logging**: Store cases in database for querying
4. **Webhook notifications**: Send cases to external analysis service
5. **Web UI**: Browse and annotate cases through admin interface
6. **Export tool**: Convert markdown to CSV for analysis
7. **Auto-archival**: Move files older than N months to archive

## Related Documentation

- [Review Eval Case Collection Spec](./review-eval-case-collection-spec.md) - Detailed specification
- [Book Extraction Service](../src/services/book-extraction.service.ts) - Extraction algorithm
- [Review Handler](../src/bot/handlers/review.ts) - Integration point
