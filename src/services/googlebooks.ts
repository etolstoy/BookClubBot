import { config } from "../lib/config.js";

export interface GoogleBookResult {
  id: string;
  title: string;
  authors: string[];
  description?: string;
  categories?: string[];
  publishedDate?: string;
  pageCount?: number;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  infoLink?: string;
}

export interface BookSearchResult {
  googleBooksId: string;
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  publicationYear: number | null;
  coverUrl: string | null;
  googleBooksUrl: string | null;
  isbn: string | null;
  pageCount: number | null;
}

function extractYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function extractISBN(
  identifiers?: Array<{ type: string; identifier: string }>
): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((id) => id.type === "ISBN_13");
  if (isbn13) return isbn13.identifier;
  const isbn10 = identifiers.find((id) => id.type === "ISBN_10");
  return isbn10?.identifier ?? null;
}

function getBestCoverUrl(
  imageLinks?: GoogleBookResult["imageLinks"]
): string | null {
  if (!imageLinks) return null;
  // Prefer higher quality images
  return (
    imageLinks.large ||
    imageLinks.medium ||
    imageLinks.small ||
    imageLinks.thumbnail ||
    imageLinks.smallThumbnail ||
    null
  );
}


export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: "10",
    printType: "books",
  });

  if (config.googleBooksApiKey) {
    params.set("key", config.googleBooksApiKey);
  }

  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { items?: Array<{ id: string; volumeInfo: GoogleBookResult }> };

    if (!data.items || data.items.length === 0) {
      return [];
    }

    return data.items.map(
      (item: { id: string; volumeInfo: GoogleBookResult }): BookSearchResult => {
        const info = item.volumeInfo;
        const title = info.title || "Unknown Title";
        const author = info.authors?.join(", ") ?? null;
        const isbn = extractISBN(info.industryIdentifiers);

        return {
          googleBooksId: item.id,
          title,
          author,
          description: info.description ?? null,
          genres: info.categories ?? [],
          publicationYear: extractYear(info.publishedDate),
          coverUrl: getBestCoverUrl(info.imageLinks),
          googleBooksUrl: info.infoLink ?? null,
          isbn,
          pageCount: info.pageCount ?? null,
        };
      }
    );
  } catch (error) {
    console.error("Error searching Google Books:", error);
    return [];
  }
}

export async function getBookById(
  volumeId: string
): Promise<BookSearchResult | null> {
  const params = new URLSearchParams();

  if (config.googleBooksApiKey) {
    params.set("key", config.googleBooksApiKey);
  }

  const url = `https://www.googleapis.com/books/v1/volumes/${volumeId}?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return null;
    }

    const item = await response.json() as { id: string; volumeInfo: GoogleBookResult };
    const info = item.volumeInfo;
    const title = info.title || "Unknown Title";
    const author = info.authors?.join(", ") ?? null;
    const isbn = extractISBN(info.industryIdentifiers);

    return {
      googleBooksId: item.id,
      title,
      author,
      description: info.description ?? null,
      genres: info.categories ?? [],
      publicationYear: extractYear(info.publishedDate),
      coverUrl: getBestCoverUrl(info.imageLinks),
      googleBooksUrl: info.infoLink ?? null,
      isbn,
      pageCount: info.pageCount ?? null,
    };
  } catch (error) {
    console.error("Error fetching book by ID:", error);
    return null;
  }
}

export async function searchBookByTitleAndAuthor(
  title: string,
  author?: string
): Promise<BookSearchResult | null> {
  let query = `intitle:${title}`;
  if (author) {
    query += `+inauthor:${author}`;
  }

  const results = await searchBooks(query);
  return results[0] ?? null;
}
