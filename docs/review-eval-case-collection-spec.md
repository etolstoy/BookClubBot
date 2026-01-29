# Review Evaluation Case Collection - Technical Specification

## Overview

Automatically collect problematic book extraction and matching cases from production to build an evaluation dataset for improving the book extraction service quality.

## Objectives

1. Identify and store cases where book extraction or matching failed or had low confidence
2. Enable periodic review of problematic cases to add to evaluation dataset
3. Maintain user privacy through anonymization
4. Operate transparently without impacting user experience

## Collection Criteria

The system will collect cases when **ANY** of the following conditions are met:

### 1. Manual Entry Flow
- User rejected all suggested book matches
- User chose "Enter book info manually" option
- User completed manual entry (title → author) and created review

### 2. ISBN Entry Flow
- User rejected all suggested book matches
- User chose "Enter ISBN" option
- User completed ISBN lookup and created review

### 3. Low Confidence Selection
- Book extraction returned `confidence: 'low'`
- User selected one of the matched books from enrichment results
- Review was created successfully

**Note:** Medium and high confidence cases are NOT collected, even if user selects a match.

## When to Record

- **Timing**: Record AFTER user makes final book selection and review is successfully created
- **Completion Required**: Do NOT record if user:
  - Cancels the confirmation flow
  - Times out (15-minute timeout)
  - Abandons before completing review

## Data Schema

### Table Name: `ReviewEvalCase`

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | Int | Auto-increment primary key | Primary key |
| `reviewText` | Text | Full review message text | Required |
| `extractedTitle` | String? | Title extracted by LLM | Nullable (null if extraction failed) |
| `extractedAuthor` | String? | Author extracted by LLM | Nullable (null if extraction failed) |
| `extractionConfidence` | String? | Confidence level from extraction | Enum: 'high', 'medium', 'low', or null |
| `collectionReason` | String | Why this case was collected | Enum: 'LOW_CONFIDENCE_SELECTION', 'MANUAL_ENTRY', 'ISBN_ENTRY' |
| `selectedBookId` | Int | Foreign key to Book table | Required, references Book.id |
| `createdAt` | DateTime | When case was collected | Auto-generated timestamp |

**User Anonymization**: All user identifiers (Telegram user ID, message ID, chat ID) are explicitly NOT stored to protect privacy.

**Deduplication Key**: `extractedTitle` + `extractedAuthor` (case-insensitive comparison)

### Prisma Schema

```prisma
model ReviewEvalCase {
  id                    Int      @id @default(autoincrement())
  reviewText            String   // Full review message text
  extractedTitle        String?  // Extracted by LLM, null if extraction failed
  extractedAuthor       String?  // Extracted by LLM, null if extraction failed
  extractionConfidence  String?  // 'high' | 'medium' | 'low' | null
  collectionReason      String   // 'LOW_CONFIDENCE_SELECTION' | 'MANUAL_ENTRY' | 'ISBN_ENTRY'
  selectedBookId        Int      // What book the user ultimately chose
  selectedBook          Book     @relation(fields: [selectedBookId], references: [id])
  createdAt             DateTime @default(now())

  @@index([extractedTitle, extractedAuthor]) // For deduplication queries
  @@index([createdAt]) // For time-based filtering
  @@index([collectionReason]) // For filtering by issue type
}
```

## Deduplication Logic

### When to Skip Recording

Before creating a new `ReviewEvalCase`, check if a record already exists with:
- Same `extractedTitle` (case-insensitive, trimmed)
- Same `extractedAuthor` (case-insensitive, trimmed)

If match found: **Skip silently** (do not create duplicate record)

**Rationale**: We want one example per unique extraction error, not multiple instances of the same issue.

### Edge Cases

- If `extractedTitle` or `extractedAuthor` is null → still check for duplicates using null values
- Multiple users experiencing the same extraction issue → only first occurrence is stored
- When extraction completely fails (returns null), store `null` values (not empty strings) for `extractedTitle` and `extractedAuthor`

## Implementation Points

### Service Layer

Create new service: `src/services/review-eval-case.service.ts`

```typescript
class ReviewEvalCaseService {
  /**
   * Attempt to record a problematic case
   * Returns true if recorded, false if skipped (duplicate/error)
   */
  async recordCase(params: {
    reviewText: string;
    extractedTitle: string | null;
    extractedAuthor: string | null;
    extractionConfidence: 'high' | 'medium' | 'low' | null;
    collectionReason: 'LOW_CONFIDENCE_SELECTION' | 'MANUAL_ENTRY' | 'ISBN_ENTRY';
    selectedBookId: number;
  }): Promise<boolean>
}
```

### Integration Points

Modify `src/bot/handlers/book-confirmation.ts` to call `ReviewEvalCaseService.recordCase()`:

1. **After Manual Entry Confirmation** (`CONFIRMING_MANUAL_BOOK` → review created)
   - Reason: `MANUAL_ENTRY`
   - Extract: extractedTitle, extractedAuthor, extractionConfidence from state
   - Book: the manually entered book (created via Book service)

2. **After ISBN Entry Confirmation** (`CONFIRMING_ISBN_BOOK` → review created)
   - Reason: `ISBN_ENTRY`
   - Extract: extractedTitle, extractedAuthor, extractionConfidence from state
   - Book: the ISBN-looked-up book

3. **After Low Confidence Selection** (user clicks matched book with confidence='low')
   - Reason: `LOW_CONFIDENCE_SELECTION`
   - Extract: extractedTitle, extractedAuthor, extractionConfidence='low' from state
   - Book: the selected book from enrichment results

### Error Handling

**Critical Requirement**: Recording must NEVER block review creation

```typescript
try {
  await reviewEvalCaseService.recordCase({...});
} catch (error) {
  // Log error but continue
  console.error('Failed to record eval case:', error);
  // Do NOT throw - review creation must proceed
}
```

### Deduplication Query

```typescript
// Check for existing case with same extraction
// Note: null values are compared as null (extraction complete failures)
const existingCase = await prisma.reviewEvalCase.findFirst({
  where: {
    extractedTitle: extractedTitle === null ? null : {
      equals: extractedTitle,
      mode: 'insensitive'
    },
    extractedAuthor: extractedAuthor === null ? null : {
      equals: extractedAuthor,
      mode: 'insensitive'
    }
  }
});

if (existingCase) {
  return false; // Skip, duplicate found
}
```

## Data Access & Review Workflow

### Primary Access Method

**Prisma Studio**: `npx prisma studio`

Navigate to `ReviewEvalCase` table to browse, filter, and export cases.

### Useful Queries

```sql
-- Get all manual entry cases
SELECT * FROM ReviewEvalCase WHERE collectionReason = 'MANUAL_ENTRY';

-- Get low confidence selections
SELECT * FROM ReviewEvalCase WHERE collectionReason = 'LOW_CONFIDENCE_SELECTION';

-- Get cases from last 30 days
SELECT * FROM ReviewEvalCase WHERE createdAt >= datetime('now', '-30 days');

-- Get cases with null extraction (complete failures)
SELECT * FROM ReviewEvalCase WHERE extractedTitle IS NULL OR extractedAuthor IS NULL;

-- Count cases by reason
SELECT collectionReason, COUNT(*) as count
FROM ReviewEvalCase
GROUP BY collectionReason;

-- Join with Book to see what users actually selected
SELECT
  rec.reviewText,
  rec.extractedTitle,
  rec.extractedAuthor,
  b.title as selectedTitle,
  b.author as selectedAuthor,
  rec.collectionReason
FROM ReviewEvalCase rec
JOIN Book b ON rec.selectedBookId = b.id;
```

### Export for Evaluation Dataset

```typescript
// Export to JSON for eval tooling
const cases = await prisma.reviewEvalCase.findMany({
  include: { selectedBook: true },
  orderBy: { createdAt: 'desc' }
});

// Transform to eval format
const evalDataset = cases.map(c => ({
  input: c.reviewText,
  extracted: {
    title: c.extractedTitle,
    author: c.extractedAuthor,
    confidence: c.extractionConfidence
  },
  expected: {
    title: c.selectedBook.title,
    author: c.selectedBook.author
  },
  reason: c.collectionReason
}));
```

## Configuration

**No Configuration Required**

- Feature is always enabled
- No environment variables
- No feature flags

**Rationale**: This is core functionality for continuous improvement. No reason to disable.

## Privacy & Data Protection

### Anonymization

- **No** Telegram user IDs stored
- **No** Telegram message IDs stored
- **No** Telegram chat IDs stored

This makes the data completely anonymous - cannot be linked back to specific users.

### Review Text Storage

Full review text IS stored because:
- Necessary to understand extraction context
- Helps improve extraction prompts
- User reviews are already semi-public (posted in book club chat)

**Assumption**: Review text does not contain sensitive personal information (reviews are about books, not personal matters)

## Data Retention

**Keep Forever** - No automatic cleanup or retention limits

**Rationale**:
- These are valuable training examples
- Storage is cheap
- Historical data helps track improvement over time
- Can manually delete records if needed

## Non-Functional Requirements

### Performance
- Recording must not add noticeable latency to review creation
- Use async recording (don't wait for DB write to complete if possible)
- Deduplication query should use indexed fields

### Reliability
- Recording failures must not break review creation
- Log errors for monitoring but continue normal flow

### Monitoring
- Log when cases are recorded (info level)
- Log when cases are skipped due to deduplication (debug level)
- Log recording errors (error level)

## Testing Strategy

### Unit Tests
- Test deduplication logic (case-insensitive, trimming)
- Test null handling in deduplication
- Test error handling (recording failures don't throw)

### Integration Tests
- Test recording after manual entry flow
- Test recording after ISBN entry flow
- Test recording after low confidence selection
- Test that review creation succeeds even if recording fails

### Manual Testing
1. Submit review that triggers each collection reason
2. Verify record appears in database with correct fields
3. Submit duplicate (same extracted book) → verify not duplicated
4. Verify user IDs are NOT stored (null)

## Future Enhancements (Not in Scope)

- Admin command to export cases via Telegram bot
- API endpoint for programmatic access
- Status tracking (reviewed, added to eval set)
- Occurrence counter for duplicates
- Web UI in Mini App for browsing cases
- Automatic comparison of extraction vs. selected book (similarity metrics)

## Migration Plan

1. **Add Prisma Model**: Add `ReviewEvalCase` to `prisma/schema.prisma`
2. **Generate Migration**: `npx prisma migrate dev --name add_review_eval_case_table`
3. **Create Service**: Implement `src/services/review-eval-case.service.ts`
4. **Integrate**: Add calls in `src/bot/handlers/book-confirmation.ts`
5. **Test**: Manual testing in development environment
6. **Deploy**: Deploy to production, monitor for errors
7. **Verify**: Check Prisma Studio after a few days to see collected cases

## Success Criteria

- ✅ Cases are automatically collected based on defined criteria
- ✅ No duplicates (same extracted book) in table
- ✅ User IDs are not stored (anonymized)
- ✅ Review creation never fails due to recording errors
- ✅ Data is accessible via Prisma Studio
- ✅ Can export cases to evaluation dataset format

## Open Questions

None - specification is complete.
