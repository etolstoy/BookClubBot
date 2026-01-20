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
