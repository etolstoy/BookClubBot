# Testing Guide for BookClubBot

This directory contains unit tests for the BookClubBot project.

## Directory Structure

```
test/
├── unit/                   # Unit tests (isolated components)
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

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- test/unit/string-utils.test.ts
```

## Writing Tests

Unit tests verify isolated components and utility functions:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSimilarity } from '../../src/lib/string-utils.js';

describe('String Utilities', () => {
  it('should calculate similarity correctly', () => {
    const result = calculateSimilarity('test', 'test');
    expect(result).toBe(1.0);
  });
});
```

## Coverage Goals

- **Overall**: 60%
- **Utils**: 80%

## Debugging Tests

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

## Resources

- [Vitest Documentation](https://vitest.dev/)
