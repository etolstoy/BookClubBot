/**
 * Global test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Set required environment variables for tests (use defaults if not already set)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'test_token_12345';
process.env.BOT_USERNAME = process.env.BOT_USERNAME || 'test_bot';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test_openai_key';
process.env.ADMIN_USER_IDS = process.env.ADMIN_USER_IDS || '123456789,987654321';

beforeAll(async () => {
  console.log('🧪 Test environment initialized');
});

afterAll(async () => {
  console.log('✅ All tests completed');
});
