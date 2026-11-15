/**
 * LLM Client Factory
 * Creates configured LLM client instances with notification callbacks
 */

import { CascadingOpenAIClient } from "./cascading-openai-client.js";
import { config } from "../../lib/config.js";
import {
  sendErrorNotification,
  sendWarningNotification,
} from "../../services/notification.service.js";
import type { ILLMClient } from "../../lib/interfaces/index.js";

/**
 * Create and configure an LLM client (OpenAI extraction and Jev sentiment)
 * Includes error and rate limit notification handlers
 * @returns Configured ILLMClient instance
 */
export function createLLMClient(): ILLMClient {
  return new CascadingOpenAIClient({
    apiKey: config.openaiApiKey,
    jevApiKey: config.jevApiKey,
    defaultModel: "gpt-6-luna",
    defaultTemperature: 1,
    onRateLimit: async (error: Error) => {
      await sendErrorNotification(error, {
        operation: "OpenAI API",
        additionalInfo:
          "Rate limit or quota exceeded. Check OpenAI billing and usage limits.",
      });
    },
    onError: async (error: Error, operation: string) => {
      await sendWarningNotification(`OpenAI ${operation} failed`, {
        operation,
        additionalInfo: `Error: ${error.message}`,
      });
    },
  });
}
