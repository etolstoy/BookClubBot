# Testing Guide for BookClubBot

This directory contains all tests for the BookClubBot project.

## Directory Structure

```
test/
├── e2e/                    # End-to-end tests (full pipeline)
├── integration/            # Integration tests (multiple components)
├── unit/                   # Unit tests (isolated components)
├── fixtures/               # Test data
│   ├── reviews/           # Anonymized review samples
│   ├── books/             # Book data
│   └── gpt-responses/     # Mock API responses
├── mocks/                  # API mocks (MSW)
│   ├── openai.mock.ts
│   └── googlebooks.mock.ts
├── utils/                  # Test utilities
│   ├── test-db.ts         # Database setup
│   └── factories.ts       # Data factories
├── setup.ts                # Global test setup
└── README.md              # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run with UI (recommended for development)
npm run test:ui

# Run with coverage
npm run test:coverage

# Run only E2E tests
npm run test:e2e

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- test/e2e/review-pipeline.test.ts
```

## Writing Tests

### E2E Tests

E2E tests verify the entire pipeline from input to output:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase } from '@test/utils/test-db';
import { openaiMockServer } from '@test/mocks/openai.mock';

describe('Feature Name - E2E', () => {
  const getPrisma = setupTestDatabase();

  beforeAll(() => {
    openaiMockServer.listen();
  });

  afterAll(() => {
    openaiMockServer.close();
  });

  it('should complete the happy path', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Integration tests verify interactions between multiple components:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '@/api/server';

describe('API Endpoint', () => {
  it('should return correct response', async () => {
    const response = await request(app).get('/api/books');
    expect(response.status).toBe(200);
  });
});
```

### Unit Tests

Unit tests verify isolated components:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSimilarity } from '@/lib/string-utils';

describe('String Utilities', () => {
  it('should calculate similarity correctly', () => {
    const result = calculateSimilarity('test', 'test');
    expect(result).toBe(1.0);
  });
});
```

## Test Data

### Fixtures

Test fixtures are located in `test/fixtures/` and include:

- **anonymized-samples.json**: 50 real reviews anonymized using OpenAI
- Generated via: `npm run anonymize`
- Safe to commit to git (no PII)

### Factories

Use factories to generate test data:

```typescript
import { BookFactory, ReviewFactory } from '@test/utils/factories';

const book = BookFactory.createGatsby();
const review = ReviewFactory.createPositive({ bookId: book.id });
```

### Mocks

API mocks are configured using MSW:

```typescript
import {mockNextBookExtraction, mockGPTResponses } from '@test/mocks/openai.mock';

// Mock specific response
mockNextBookExtraction(mockGPTResponses.successfulExtraction);
```

## Coverage Goals

- **Overall**: 80%
- **Critical paths**: 95% (review pipeline, book extraction)
- **Services**: 85%
- **Handlers**: 75%
- **Utils**: 90%

## Debugging Tests

### Enable SQL logging

```bash
DEBUG_TESTS=true npm test
```

### Run single test

```bash
npm test -- -t "test name pattern"
```

### Use test UI

```bash
npm run test:ui
```

This opens a browser interface where you can:
- View test results
- Filter by file/test name
- See console output
- Inspect errors

## CI/CD Integration

Tests run automatically on every push via GitHub Actions.

See `.github/workflows/test.yml` for configuration.

## Common Issues

### 1. Database connection errors

**Problem**: `Unable to open the database file`

**Solution**: Ensure test setup is called: `const getPrisma = setupTestDatabase();`

### 2. MSW handlers not working

**Problem**: Real API calls being made

**Solution**: Ensure mock servers are started in `beforeAll`:

```typescript
beforeAll(() => {
  openaiMockServer.listen();
  googlebooksMockServer.listen();
});

afterAll(() => {
  openaiMockServer.close();
  googlebooksMockServer.close();
});
```

### 3. BigInt serialization errors

**Problem**: `TypeError: Do not know how to serialize a BigInt`

**Solution**: Convert to string before JSON serialization:

```typescript
const data = {
  userId: review.telegramUserId.toString(),
};
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Faker.js Documentation](https://fakerjs.dev/)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing)
