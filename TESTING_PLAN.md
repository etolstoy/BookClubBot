# BookClubBot Testing Implementation Plan

**Status**: ✅ Foundation Complete | 📝 Ready for Test Development

## What We've Accomplished

### ✅ Phase 0: Test Data Generation (COMPLETE)
- [x] Created anonymization script (`scripts/anonymize-reviews.ts`)
- [x] Generated 50 anonymized reviews from production data
- [x] Test fixtures saved to `test/fixtures/reviews/anonymized-samples.json`
- [x] Statistics: 47 Russian, 1 English, 2 Mixed language samples
- [x] Complexity range: 29 Medium, 21 Complex reviews

### ✅ Phase 1: Testing Infrastructure (COMPLETE)
- [x] Installed Vitest + coverage tools
- [x] Created `vitest.config.ts` with coverage thresholds
- [x] Set up test directory structure (`e2e/`, `integration/`, `unit/`)
- [x] Created `test/setup.ts` for global configuration
- [x] All tests use in-memory SQLite (no production data needed)

### ✅ Phase 2: Test Utilities (COMPLETE)
- [x] Database setup utility (`test/utils/test-db.ts`)
  - In-memory SQLite for each test
  - Automatic schema migrations
  - Cleanup after each test
- [x] Test data factories (`test/utils/factories.ts`)
  - BookFactory with faker.js integration
  - ReviewFactory with sentiment variants
  - TelegramMessageFactory for bot testing
- [x] OpenAI API mocks (`test/mocks/openai.mock.ts`)
  - Book extraction responses
  - Sentiment analysis responses
  - Rate limit/quota error scenarios
- [x] Google Books API mocks (`test/mocks/googlebooks.mock.ts`)
  - Search result mocking
  - ISBN lookup mocking
  - Rate limit error scenarios

### ✅ Phase 3: Proof of Concept (COMPLETE)
- [x] First unit test written (`test/unit/string-utils.test.ts`)
- [x] **12 tests passing** ✅
- [x] Test execution time: 3ms
- [x] Infrastructure verified working

---

## Test Coverage Strategy

### Priority 1: Review Processing Pipeline (E2E)

**File**: `test/e2e/review-pipeline.test.ts` (NOT YET WRITTEN)

Tests to implement:
```typescript
describe('Review Processing Pipeline - E2E', () => {
  // Happy path
  ✓ should process hashtag review: extraction → enrichment → creation
  ✓ should process /review command with reply
  ✓ should extract book from quoted title format
  ✓ should extract book from Cyrillic text

  // Error handling
  ✓ should handle GPT extraction failure gracefully
  ✓ should prevent duplicate reviews
  ✓ should handle concurrent reviews from same user

  // Edge cases
  ✓ should handle review with no book info
  ✓ should handle review mentioning multiple books
  ✓ should handle very short reviews (< 50 chars)
  ✓ should handle very long reviews (> 2000 chars)
});
```

**Estimated effort**: 4-6 hours
**Priority**: HIGHEST

---

### Priority 2: Book Confirmation State Machine (E2E)

**File**: `test/e2e/book-confirmation.test.ts` (NOT YET WRITTEN)

Tests to implement:
```typescript
describe('Book Confirmation State Machine - E2E', () => {
  // Flow completion
  ✓ should complete ISBN entry flow
  ✓ should complete manual entry flow (title → author)
  ✓ should complete direct book selection
  ✓ should use extracted book when confidence is high

  // State management
  ✓ should allow cancellation from any state
  ✓ should handle state timeout cleanup (15 minutes)
  ✓ should prevent overlapping confirmations for same user

  // Edge cases
  ✓ should handle invalid ISBN format
  ✓ should handle message deletion failures
  ✓ should handle concurrent state modifications
});
```

**Estimated effort**: 3-4 hours
**Priority**: HIGH

---

### Priority 3: API Contract Tests (Integration)

**File**: `test/integration/api-contracts.test.ts` (NOT YET WRITTEN)

Tests to implement:
```typescript
describe('API Contract Tests', () => {
  describe('Books Endpoints', () => {
    ✓ GET /api/books should return books with correct schema
    ✓ GET /api/books/:id should include reviews with BigInt conversion
    ✓ GET /api/books/search should filter by title/author
    ✓ PATCH /api/books/:id should require admin auth
    ✓ DELETE /api/books/:id should cascade delete reviews
  });

  describe('Leaderboard Endpoints', () => {
    ✓ GET /api/leaderboard/reviewers/monthly should handle date params
    ✓ GET /api/leaderboard/reviewers should aggregate correctly
    ✓ GET /api/leaderboard/books should rank by review count
  });

  describe('Reviews Endpoints', () => {
    ✓ GET /api/reviews/recent should paginate correctly
    ✓ PATCH /api/reviews/:id should allow owner/admin only
    ✓ DELETE /api/reviews/:id should trigger orphan cleanup
  });
});
```

**Estimated effort**: 3-4 hours
**Priority**: HIGH

---

### Priority 4: Service Unit Tests

**Files to create**:
- `test/unit/book-extraction.service.test.ts`
- `test/unit/book-enrichment.service.test.ts`
- `test/unit/sentiment.service.test.ts`

**Estimated effort**: 4-5 hours
**Priority**: MEDIUM

---

## How to Continue Testing

### Option A: Write E2E Tests First (Recommended)

**Why**: Catches integration issues early, validates whole pipeline

**Next steps**:
1. Create `test/e2e/review-pipeline.test.ts`
2. Write happy path test using anonymized fixtures
3. Add error handling tests
4. Run: `npm run test:ui` to develop iteratively

**Example template**:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase } from '../utils/test-db.js';
import { openaiMockServer, mockNextBookExtraction } from '../mocks/openai.mock.js';
import { googlebooksMockServer } from '../mocks/googlebooks.mock.js';
import { TelegramMessageFactory } from '../utils/factories.js';
import anonymizedReviews from '../fixtures/reviews/anonymized-samples.json';

describe('Review Processing Pipeline - E2E', () => {
  const getPrisma = setupTestDatabase();

  beforeAll(() => {
    openaiMockServer.listen();
    googlebooksMockServer.listen();
  });

  afterAll(() => {
    openaiMockServer.close();
    googlebooksMockServer.close();
  });

  beforeEach(() => {
    openaiMockServer.resetHandlers();
    googlebooksMockServer.resetHandlers();
  });

  it('should process hashtag review from anonymized fixture', async () => {
    // Get first review from fixtures
    const fixture = anonymizedReviews.reviews[0];

    // Mock GPT extraction
    mockNextBookExtraction({
      primaryBook: {
        title: fixture.book.title,
        author: fixture.book.author || '',
        confidence: 'high',
      },
      alternativeBooks: [],
    });

    // Create Telegram message
    const message = TelegramMessageFactory.createReviewMessage(
      fixture.book.title,
      fixture.book.author || '',
      { text: fixture.reviewText }
    );

    // TODO: Call handleReviewMessage (needs refactoring to be testable)
    // const mockBot = createMockBot();
    // await handleReviewMessage(mockBot, message);

    // Verify review was created
    const db = getPrisma();
    const reviews = await db.review.findMany();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewText).toContain(fixture.book.title);
  });
});
```

### Option B: Write API Tests First

**Why**: Faster to implement, immediate value for frontend team

**Next steps**:
1. Create `test/integration/api-contracts.test.ts`
2. Test all GET endpoints first
3. Add authentication tests
4. Run: `npm run test:coverage` to track progress

---

## Running Tests

```bash
# Run all tests
npm test

# Run with UI (HIGHLY RECOMMENDED for development)
npm run test:ui

# Run with coverage report
npm run test:coverage

# Run only E2E tests
npm run test:e2e

# Run specific test file
npm test -- test/unit/string-utils.test.ts

# Watch mode
npm test -- --watch
```

---

## CI/CD Integration (TODO)

**File to create**: `.github/workflows/test.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

**Priority**: MEDIUM (add after writing first E2E tests)

---

## Known Issues to Fix

### Critical Issues Found During Setup

1. **Bug in book-extraction.service.ts** (Line 107-109)
   - CLAUDE.md claims regex fallback exists
   - Code actually returns `null` on GPT failure
   - **Fix**: Implement regex fallback or update docs

2. **Race condition in state cleanup**
   - State machine timeout (15 min) may delete active sessions
   - **Fix**: Check session activity before cleanup

3. **ISBN validation too restrictive**
   - Line 592 in `book-confirmation.ts`
   - Regex may reject valid ISBN formats
   - **Fix**: Use standard ISBN validation library

4. **No transliteration handling**
   - "Война и мир" won't match "Voyna i mir"
   - **Fix**: Add transliteration map or use library

5. **BigInt serialization risk**
   - Telegram IDs must be converted to strings in API
   - **Fix**: Add automated conversion layer

---

## Estimated Timeline

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| ✅ Foundation | Setup + Infrastructure | **COMPLETE** | - |
| 📝 E2E Tests | Review pipeline + State machine | 8-10 hours | HIGHEST |
| 📝 API Tests | Contract tests for all endpoints | 3-4 hours | HIGH |
| 📝 Unit Tests | Service-level tests | 4-5 hours | MEDIUM |
| 📝 CI/CD | GitHub Actions workflow | 1 hour | MEDIUM |
| 📝 Bug Fixes | Fix 5 critical issues above | 3-4 hours | HIGH |
| **Total** | - | **19-24 hours** | - |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] 80%+ code coverage
- [ ] All critical paths have E2E tests
- [ ] API contracts have integration tests
- [ ] CI/CD runs tests on every PR
- [ ] No known critical bugs

### Immediate Next Steps:

1. **Today**: Write first E2E test using template above
2. **This week**: Complete review pipeline E2E tests
3. **Next week**: Add API contract tests + CI/CD
4. **Following week**: Unit tests + bug fixes

---

## Resources

- **Test fixtures**: `test/fixtures/reviews/anonymized-samples.json`
- **Test utils**: `test/utils/` (factories, test-db)
- **Mocks**: `test/mocks/` (openai, googlebooks)
- **Documentation**: `test/README.md`
- **Vitest docs**: https://vitest.dev/
- **MSW docs**: https://mswjs.io/

---

## Questions?

1. **Where should I start?**
   - Start with E2E tests (Option A above)
   - Use anonymized fixtures for realistic test cases
   - Run `npm run test:ui` for interactive development

2. **How do I test the bot handlers?**
   - They need refactoring to be testable (dependency injection)
   - Current handlers are tightly coupled to Telegram context
   - Recommend: Extract business logic to services first

3. **Should I mock everything?**
   - Mock external APIs (OpenAI, Google Books)
   - Use real Prisma client with in-memory database
   - Don't mock your own code (use real implementations)

4. **How do I handle BigInt in tests?**
   - Use `BigInt()` constructor: `BigInt(123456789)`
   - Convert to string before JSON: `userId.toString()`
   - Factories already handle this correctly

---

**Last Updated**: 2026-01-17
**Status**: Foundation complete, ready for test development
**Next Milestone**: First E2E test passing
