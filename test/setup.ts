/**
 * Global test setup file
 * Runs before all tests
 */

import { beforeAll, afterEach, afterAll } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file::memory:?cache=shared';
process.env.BOT_TOKEN = 'test_bot_token';
process.env.OPENAI_API_KEY = 'test_openai_key';
process.env.GOOGLE_BOOKS_API_KEY = 'test_google_books_key';
process.env.TARGET_CHAT_ID = '-1001234567890';
process.env.ADMIN_CHAT_ID = '-1001234567890';
process.env.ADMIN_USER_IDS = '123456789';

beforeAll(async () => {
  // Global setup
  console.log('🧪 Test environment initialized');
});

afterEach(async () => {
  // Clean up after each test
  // Individual tests will handle their own cleanup
});

afterAll(async () => {
  // Global teardown
  console.log('✅ All tests completed');
});
