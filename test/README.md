# Testing Guide

Comprehensive testing infrastructure for BookClubBot with 146+ passing tests covering all major functionality.

## Test Organization

```
test/
├── unit/                          # Fast, isolated unit tests (75 tests)
│   ├── isbn-utils.test.ts        # ISBN validation and cleaning
│   ├── string-utils.test.ts      # String similarity and normalization
│   ├── url-utils.test.ts         # URL generation and extraction
│   └── telegram-auth.test.ts     # Telegram WebApp authentication
├── integration/                   # Integration tests with mocks (36 tests)
│   ├── book-extraction.test.ts   # LLM book extraction (10 tests)
│   ├── sentiment-analysis.test.ts # Sentiment classification (11 tests)
│   ├── book-enrichment.test.ts   # Book matching & enrichment (12 tests)
│   └── review-service.test.ts    # Review creation (6 tests, skipped)
├── state-management/              # State machine tests (10 tests)
│   └── confirmation-state.test.ts # Confirmation flow states
├── e2e/                           # End-to-end workflow tests (14 tests)
│   ├── review-flow-isbn.test.ts  # ISBN entry flow (4 tests)
│   ├── review-flow-manual-entry.test.ts # Manual entry flow (5 tests)
│   ├── review-flow-edge-cases.test.ts # Edge cases (5 tests)
│   └── review-flow-happy-path.test.ts # Full workflows (5 tests, skipped)
├── helpers/                       # Shared test utilities
│   └── test-db.ts                # Test database setup/teardown
└── README.md                     # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- test/unit/isbn-utils.test.ts

# Run tests matching pattern
npm test -- book-extraction

# Run with coverage
npm run test:coverage

# Run test UI (interactive)
npm run test:ui
```

## Test Categories

### Live sentiment evaluation

The original candidate set contains 16 production reviews: six recorded human
corrections and ten random controls. Controls exclude every review with an edit
notification in the supplied Telegram export. Each case retains its review ID
and correction or sampling provenance.

`test/fixtures/llm/sentiment-dataset.json` contains the 12 strict cases (five
positive, three neutral, four negative). The other four remain in
`sentiment-adjudication-dataset.json` with their original labels and reasons:
1172 and 1322 need label adjudication, 1317 lacks an explicit evaluative stance,
and 324 is truncated. They are not counted as passes or included in strict
accuracy. The report always lists these deferred cases. No original label was
changed to match a model prediction. Review 294's description was corrected to
the Полари series named in its text; its incorrect catalogue title is preserved
in the source metadata.

The production client uses rubric `v2`: judge the primary book's overall reading
assessment, prioritizing an explicit overall verdict, then a rating, then the
dominant evaluative stance. Ratings on known scales normalize to ten: at least
seven is positive, at most four is negative, and the middle is neutral. Qualified
praise can be positive; isolated criticisms do not establish overall rejection.
A genuinely average or balanced opinion is neutral. Plot mood, quoted dialogue,
and opinions of other books are not the reviewer's assessment of this book.
Insufficient or materially incomplete evidence yields `null`, as do API errors;
ingestion preserves it instead of inventing a neutral opinion. Unknown sentiments
are excluded from sentiment breakdowns. Applying a historical report is a separate,
explicit operation using `scripts/apply-jev-sentiments.py`; ordinary ingestion
does not rewrite historical reviews.

```bash
# Uses the production LLM client's current sentiment model and prompt.
# Loads .env; an existing environment variable takes precedence.
npm run test:sentiment-accuracy

# Run one case.
SENTIMENT_TEST_FILTER=sentiment-review-1088 npm run test:sentiment-accuracy
```

Live sentiment evaluation uses Jev 1.14, requires a real `JEV_API_KEY`, and makes
paid API calls. It is
skipped during ordinary test runs unless `RUN_SENTIMENT_ACCURACY=1` is set.
An explicitly requested run without credentials fails instead of silently skipping.

Every label must match; mismatches and API failures fail their individual tests.
The report includes overall accuracy, per-label accuracy, a confusion matrix,
case-level predictions, latency, and token usage. It is saved to
`reports/sentiment-accuracy/latest.json`; set `SENTIMENT_REPORT_PATH` to override it.
The human-approved strict labels stay fixed when a model disagrees. Scores on the
12-case strict set must not be compared directly with the original 16-case score;
the original prompt scored 8/12 on these same strict cases. Jev 1.14 with rubric
v2 currently scores 11/12: review 1121 (In the Woods) is predicted negative
against the human-corrected neutral reference. This remains a failing assertion;
the reference is not changed to match the selected model.

CI runs this suite when the LLM client, sentiment service, sentiment dataset,
or sentiment accuracy test changes, provided the API secret is available.

### Unit Tests (75 tests)

Fast, isolated tests with no external dependencies.

- **ISBN Utils**: Validation, cleaning, format detection for ISBN-10/13
- **String Utils**: Similarity scoring, normalization for book matching
- **URL Utils**: Dynamic URL generation for Google Books and Goodreads
- **Telegram Auth**: WebApp authentication hash validation

**Example:**
```typescript
import { isValidISBN } from "../src/lib/isbn-utils.js";

it("should validate ISBN-13 format", () => {
  expect(isValidISBN("978-0-7475-3269-9")).toBe(true);
  expect(isValidISBN("invalid")).toBe(false);
});
```

### Integration Tests (36 tests)

Test services with mock external APIs (OpenAI, Google Books).

- **Book Extraction**: LLM-based extraction from review text
- **Sentiment Analysis**: Positive/negative/neutral classification
- **Book Enrichment**: Matching books with 90% similarity threshold

**Example:**
```typescript
import { extractBookInfo } from "../src/services/book-extraction.service.js";
import { MockLLMClient } from "../src/clients/llm/mock-llm-client.js";

const mockClient = new MockLLMClient();
mockClient.mockResponse(reviewText, {
  extractedInfo: { title: "1984", author: "George Orwell", confidence: "high" }
});

const result = await extractBookInfo(reviewText, undefined, mockClient);
expect(result?.title).toBe("1984");
```

### State Management Tests (10 tests)

Test the confirmation flow state machine.

- User selections (first/second option)
- Cancellations
- Timeouts (15-minute expiry)
- Concurrent users
- State cleanup

**Example:**
```typescript
it("User selects first option", async () => {
  storeConfirmationState(userId, state);
  await handleBookSelected(ctx);
  expect(getConfirmationState(userId)).toBeNull(); // Cleaned up
});
```

### E2E Tests (14 tests)

End-to-end workflow tests simulating real user interactions.

- **ISBN Flow**: Valid/invalid ISBN, found/not found
- **Manual Entry**: Title → author → confirmation flow
- **Edge Cases**: Cyrillic text, mixed languages, special characters

**Example:**
```typescript
it("Valid ISBN → book found → confirm → review saved", async () => {
  mockBookDataClient.seedBooks([{ isbn: "978-0-123...", title: "Test" }]);
  const handled = await handleTextInput(ctx, botContext);
  expect(handled).toBe(true);
  expect(mockBookDataClient.getCallCount("searchBookByISBN")).toBe(1);
});
```

## Writing New Tests

### 1. Choose the Right Test Type

- **Unit test** if testing a single function with no dependencies
- **Integration test** if testing a service with mocked external APIs
- **E2E test** if testing a complete user workflow end-to-end

### 2. Use Mock Clients

For testability, all services accept optional client parameters:

```typescript
// Production: uses factory-created real clients
await extractBookInfo(reviewText);

// Testing: inject mock client
const mockClient = new MockLLMClient();
await extractBookInfo(reviewText, undefined, mockClient);
```

### 3. Mock Client API

**MockLLMClient**:
```typescript
const mockLLM = new MockLLMClient();

// Mock specific response
mockLLM.mockResponse(reviewText, {
  extractedInfo: { title: "1984", author: "Orwell", confidence: "high" }
});

// Set behavior mode
mockLLM.setBehavior("rate_limit"); // Throws rate limit error

// Verify calls
expect(mockLLM.getCallCount("extractBookInfo")).toBe(1);
mockLLM.clearCallLog();
```

**MockBookDataClient**:
```typescript
const mockBooks = new MockBookDataClient();

// Seed books for searches
mockBooks.seedBooks([
  { googleBooksId: "id", title: "Test", author: "Author", isbn: "..." }
]);

// Set behavior mode
mockBooks.setBehavior("not_found"); // Returns null
mockBooks.setBehavior("api_error");  // Throws error

// Verify calls
expect(mockBooks.getCallCount("searchBooks")).toBe(1);
```

### 4. Test Context Pattern

For handlers, create mock Telegraf contexts:

```typescript
const ctx = {
  message: { text: "test", from: { id: 123 }, chat: { id: 1, type: "group" } },
  telegram: {
    editMessageText: vi.fn().mockResolvedValue({}),
    deleteMessage: vi.fn().mockResolvedValue(true),
  },
  reply: vi.fn().mockResolvedValue({}),
} as Partial<Context>;

const botContext = createTestContext(mockLLM, mockBooks);
await handleReviewMessage(ctx as Context, botContext);
```

### 5. Test Database (for services)

Use test database helper for integration tests that need persistence:

```typescript
import { setupTestDatabase, teardownTestDatabase } from "../helpers/test-db.js";

let testDb: PrismaClient;
let testDbPath: string;

beforeEach(async () => {
  const setup = await setupTestDatabase();
  testDb = setup.prisma;
  testDbPath = setup.dbPath;
});

afterEach(async () => {
  await teardownTestDatabase(testDb, testDbPath);
});
```

## Test Coverage

Current coverage: **~80%** of critical paths

**Well-covered:**
- ✅ Utility functions (ISBN, URLs, strings)
- ✅ LLM extraction and sentiment analysis
- ✅ Book enrichment and matching
- ✅ Confirmation state machine
- ✅ Edge cases (Cyrillic, special chars)

**Future improvements:**
- ⏳ Full E2E workflows with database (currently skipped)
- ⏳ API routes testing
- ⏳ Notification service testing
- ⏳ Leaderboard calculations

## Debugging Failed Tests

### 1. Check Mock Configuration

Ensure mocks are configured before calling the function:

```typescript
// ❌ Wrong - mock not configured
const result = await extractBookInfo(text, undefined, mockClient);
mockClient.mockResponse(text, { ... }); // Too late!

// ✅ Correct - mock configured first
mockClient.mockResponse(text, { extractedInfo: { ... } });
const result = await extractBookInfo(text, undefined, mockClient);
```

### 2. Verify Context Structure

Handler tests need complete context objects:

```typescript
// ❌ Missing editMessageText on ctx
const ctx = { telegram: { editMessageText: vi.fn() } };

// ✅ Has both telegram.editMessageText and ctx.editMessageText
const ctx = {
  telegram: { editMessageText: vi.fn() },
  editMessageText: vi.fn(), // Also needed!
};
```

### 3. Check Async/Await

Always await async operations:

```typescript
// ❌ Not awaited
handleReviewMessage(ctx);
expect(getConfirmationState(userId)).not.toBeNull(); // Fails!

// ✅ Awaited
await handleReviewMessage(ctx);
expect(getConfirmationState(userId)).not.toBeNull(); // Works!
```

### 4. Clear State Between Tests

Use `beforeEach` to reset state:

```typescript
beforeEach(() => {
  mockClient = new MockLLMClient();
  clearConfirmationState("123");
  vi.clearAllMocks();
});
```

## CI/CD Integration

Tests run automatically on:
- **Pull Requests**: Full test suite must pass
- **Main branch pushes**: Full test suite + coverage report
- **Deployments**: Smoke tests before deploy

```yaml
# .github/workflows/test.yml
- run: npm test -- --run
- run: npm run test:coverage
```

## Best Practices

1. **Keep tests focused**: One concept per test
2. **Use descriptive names**: "should validate ISBN-13 format" not "test1"
3. **Arrange-Act-Assert**: Setup → Execute → Verify
4. **Mock external APIs**: Never make real API calls in tests
5. **Clean up state**: Use beforeEach/afterEach hooks
6. **Test edge cases**: Empty strings, null values, special characters
7. **Verify behavior, not implementation**: Test what it does, not how

## Troubleshooting

**"Module not found" errors:**
- Ensure `.js` extensions in imports (ES modules requirement)
- Check file paths are absolute, not relative

**"Timeout" errors:**
- Increase timeout: `{ timeout: 10000 }`
- Check for missing `await` on async functions

**"Unexpected token" errors:**
- Ensure Vitest is configured for TypeScript
- Check `tsconfig.json` includes test files

**Database tests failing:**
- Ensure Prisma schema is up to date: `npx prisma generate`
- Check `test-db.ts` helper is cleaning up properly

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Telegraf Testing](https://telegraf.js.org/testing)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing)
- [Mock Patterns](https://martinfowler.com/articles/mocksArentStubs.html)

### Approved historical Jev backfill

Use the full results JSON from the approved audit, not a fresh unreviewed run.
Stop review writers before applying. The command checks each review's text, book
assignment, and old sentiment against the snapshot; conflicting edits and new
reviews are preserved. Jev's unknown choice is stored as SQL NULL. Only the
sentiment column is updated, in one transaction, after a SQLite backup passes
integrity checking. The output directory contains the backup and per-review audit.

```bash
# Preview without changing the database.
python3 scripts/apply-jev-sentiments.py /path/bookclub.db /path/results.json --output-dir /path/audit
# Apply the reviewed results, after stopping writers.
python3 scripts/apply-jev-sentiments.py /path/bookclub.db /path/results.json --output-dir /path/audit --apply
# Test backup, edit conflict handling, and unknown label persistence.
python3 -m unittest discover -s test/unit -p 'test_jev_backfill.py'
```
