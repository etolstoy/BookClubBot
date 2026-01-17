/**
 * OpenAI API Mocks
 *
 * Uses MSW (Mock Service Worker) to intercept OpenAI API calls
 * Provides predefined responses for book extraction and sentiment analysis
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Mock responses for different scenarios
 */
export const mockGPTResponses = {
  // Successful book extraction
  successfulExtraction: {
    primaryBook: {
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      confidence: 'high',
    },
    alternativeBooks: [],
  },

  // Extraction with medium confidence
  mediumConfidence: {
    primaryBook: {
      title: '1984',
      author: 'Orwell',
      confidence: 'medium',
    },
    alternativeBooks: [
      {
        title: '1984',
        author: 'George Orwell',
        confidence: 'high',
      },
    ],
  },

  // Complex extraction with multiple books
  multipleBooks: {
    primaryBook: {
      title: 'Война и мир',
      author: 'Лев Толстой',
      confidence: 'high',
    },
    alternativeBooks: [
      {
        title: 'War and Peace',
        author: 'Leo Tolstoy',
        confidence: 'high',
      },
    ],
  },

  // Failed extraction - no book found
  failedExtraction: null,

  // Sentiment responses
  sentimentPositive: 'positive',
  sentimentNegative: 'negative',
  sentimentNeutral: 'neutral',
};

/**
 * Default mock handler - returns successful extraction
 */
const defaultHandler = http.post(
  'https://api.openai.com/v1/chat/completions',
  async ({ request }) => {
    const body = await request.json() as any;
    const prompt = body.messages?.[0]?.content || '';

    // Check if it's a book extraction request
    if (prompt.includes('extract book information') || prompt.includes('Extract the book')) {
      return HttpResponse.json({
        choices: [
          {
            message: {
              content: JSON.stringify(mockGPTResponses.successfulExtraction),
            },
          },
        ],
      });
    }

    // Check if it's a sentiment analysis request
    if (prompt.includes('sentiment') || prompt.includes('Sentiment')) {
      return HttpResponse.json({
        choices: [
          {
            message: {
              content: mockGPTResponses.sentimentPositive,
            },
          },
        ],
      });
    }

    // Default response
    return HttpResponse.json({
      choices: [
        {
          message: {
            content: 'Test response',
          },
        },
      ],
    });
  }
);

/**
 * Mock server instance
 */
export const openaiMockServer = setupServer(defaultHandler);

/**
 * Helper to set custom response for next request
 */
export function mockNextBookExtraction(response: typeof mockGPTResponses.successfulExtraction | null) {
  openaiMockServer.use(
    http.post('https://api.openai.com/v1/chat/completions', async () => {
      return HttpResponse.json({
        choices: [
          {
            message: {
              content: response ? JSON.stringify(response) : null,
            },
          },
        ],
      });
    })
  );
}

/**
 * Helper to mock sentiment analysis
 */
export function mockNextSentiment(sentiment: 'positive' | 'negative' | 'neutral') {
  openaiMockServer.use(
    http.post('https://api.openai.com/v1/chat/completions', async () => {
      return HttpResponse.json({
        choices: [
          {
            message: {
              content: sentiment,
            },
          },
        ],
      });
    })
  );
}

/**
 * Mock rate limit error
 */
export function mockRateLimitError() {
  openaiMockServer.use(
    http.post('https://api.openai.com/v1/chat/completions', async () => {
      return HttpResponse.json(
        {
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded',
          },
        },
        { status: 429 }
      );
    })
  );
}

/**
 * Mock quota exceeded error
 */
export function mockQuotaExceededError() {
  openaiMockServer.use(
    http.post('https://api.openai.com/v1/chat/completions', async () => {
      return HttpResponse.json(
        {
          error: {
            message: 'You exceeded your current quota',
            type: 'insufficient_quota',
            code: 'insufficient_quota',
          },
        },
        { status: 429 }
      );
    })
  );
}

/**
 * Reset to default handler
 */
export function resetOpenAIMocks() {
  openaiMockServer.resetHandlers(defaultHandler);
}
