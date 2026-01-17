/**
 * Google Books API Mocks
 *
 * Uses MSW to intercept Google Books API calls
 * Provides predefined responses for book searches
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Mock book data
 */
export const mockGoogleBooksData = {
  greatGatsby: {
    kind: 'books#volume',
    id: 'test_ggb_id_gatsby',
    volumeInfo: {
      title: 'The Great Gatsby',
      authors: ['F. Scott Fitzgerald'],
      publishedDate: '1925',
      description: 'A classic American novel...',
      industryIdentifiers: [
        {
          type: 'ISBN_13',
          identifier: '9780743273565',
        },
      ],
      pageCount: 180,
      categories: ['Fiction', 'Classics'],
      imageLinks: {
        thumbnail: 'https://example.com/gatsby-cover.jpg',
      },
    },
  },

  warAndPeace: {
    kind: 'books#volume',
    id: 'test_ggb_id_war_peace',
    volumeInfo: {
      title: 'Война и мир',
      authors: ['Лев Толстой'],
      publishedDate: '1869',
      description: 'Эпический роман...',
      industryIdentifiers: [
        {
          type: 'ISBN_13',
          identifier: '9785170882540',
        },
      ],
      pageCount: 1225,
      categories: ['Fiction', 'Historical'],
      imageLinks: {
        thumbnail: 'https://example.com/war-peace-cover.jpg',
      },
    },
  },

  orwell1984: {
    kind: 'books#volume',
    id: 'test_ggb_id_1984',
    volumeInfo: {
      title: '1984',
      authors: ['George Orwell'],
      publishedDate: '1949',
      description: 'Dystopian novel...',
      industryIdentifiers: [
        {
          type: 'ISBN_13',
          identifier: '9780451524935',
        },
      ],
      pageCount: 328,
      categories: ['Fiction', 'Dystopian'],
      imageLinks: {
        thumbnail: 'https://example.com/1984-cover.jpg',
      },
    },
  },
};

/**
 * Default mock handler
 */
const defaultHandler = http.get(
  'https://www.googleapis.com/books/v1/volumes',
  async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    // Match by title/author
    if (query.toLowerCase().includes('gatsby')) {
      return HttpResponse.json({
        kind: 'books#volumes',
        totalItems: 1,
        items: [mockGoogleBooksData.greatGatsby],
      });
    }

    if (query.toLowerCase().includes('война') || query.toLowerCase().includes('толст')) {
      return HttpResponse.json({
        kind: 'books#volumes',
        totalItems: 1,
        items: [mockGoogleBooksData.warAndPeace],
      });
    }

    if (query.toLowerCase().includes('1984') || query.toLowerCase().includes('orwell')) {
      return HttpResponse.json({
        kind: 'books#volumes',
        totalItems: 1,
        items: [mockGoogleBooksData.orwell1984],
      });
    }

    // No results
    return HttpResponse.json({
      kind: 'books#volumes',
      totalItems: 0,
      items: [],
    });
  }
);

/**
 * Mock server instance
 */
export const googlebooksMockServer = setupServer(defaultHandler);

/**
 * Helper to mock specific search result
 */
export function mockGoogleBooksSearch(query: string, results: any[]) {
  googlebooksMockServer.use(
    http.get('https://www.googleapis.com/books/v1/volumes', async ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get('q') || '';

      if (q.toLowerCase().includes(query.toLowerCase())) {
        return HttpResponse.json({
          kind: 'books#volumes',
          totalItems: results.length,
          items: results,
        });
      }

      return HttpResponse.json({
        kind: 'books#volumes',
        totalItems: 0,
        items: [],
      });
    })
  );
}

/**
 * Mock ISBN search
 */
export function mockGoogleBooksISBNSearch(isbn: string, result: any) {
  googlebooksMockServer.use(
    http.get('https://www.googleapis.com/books/v1/volumes', async ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get('q') || '';

      if (q.includes(`isbn:${isbn}`)) {
        return HttpResponse.json({
          kind: 'books#volumes',
          totalItems: 1,
          items: [result],
        });
      }

      return HttpResponse.json({
        kind: 'books#volumes',
        totalItems: 0,
        items: [],
      });
    })
  );
}

/**
 * Mock rate limit error (429)
 */
export function mockGoogleBooksRateLimit() {
  googlebooksMockServer.use(
    http.get('https://www.googleapis.com/books/v1/volumes', async () => {
      return HttpResponse.json(
        {
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            errors: [
              {
                domain: 'usageLimits',
                reason: 'rateLimitExceeded',
                message: 'Rate limit exceeded',
              },
            ],
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
export function mockGoogleBooksQuotaExceeded() {
  googlebooksMockServer.use(
    http.get('https://www.googleapis.com/books/v1/volumes', async () => {
      return HttpResponse.json(
        {
          error: {
            code: 403,
            message: 'The API key quota has been exceeded',
            errors: [
              {
                domain: 'usageLimits',
                reason: 'quotaExceeded',
                message: 'Quota exceeded',
              },
            ],
          },
        },
        { status: 403 }
      );
    })
  );
}

/**
 * Reset to default handler
 */
export function resetGoogleBooksMocks() {
  googlebooksMockServer.resetHandlers(defaultHandler);
}
