/**
 * Bot Context - Dependency Injection Container
 *
 * Provides a central context object holding all dependencies (clients)
 * that can be injected into handlers and services for testing.
 */

import type { ILLMClient } from "../../lib/interfaces/index.js";
import type { IBookDataClient } from "../../lib/interfaces/index.js";
import { createLLMClient } from "../../clients/llm/factory.js";
import { createBookDataClient } from "../../clients/book-data/factory.js";

/**
 * Context object containing all external dependencies
 */
export interface BotContext {
  llmClient: ILLMClient;
  bookDataClient: IBookDataClient;
}

/**
 * Create production bot context with real clients
 */
export function createBotContext(): BotContext {
  return {
    llmClient: createLLMClient(),
    bookDataClient: createBookDataClient(),
  };
}

/**
 * Create test bot context with mock clients
 * Used in tests to inject mock implementations
 */
export function createTestContext(
  llmClient: ILLMClient,
  bookDataClient: IBookDataClient
): BotContext {
  return {
    llmClient,
    bookDataClient,
  };
}
