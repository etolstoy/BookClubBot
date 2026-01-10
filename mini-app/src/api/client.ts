const API_BASE = "/api";

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface Book {
  id: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  genres: string[];
  publicationYear: number | null;
  reviewCount: number;
  sentiments: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface BookDetail {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  genres: string[];
  publicationYear: number | null;
  pageCount: number | null;
  googleBooksUrl: string | null;
  goodreadsUrl: string | null;
  reviewCount: number;
  sentiments: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface Review {
  id: number;
  reviewerName: string;
  reviewerUsername: string | null;
  telegramUserId: string;
  reviewText: string;
  sentiment: "positive" | "negative" | "neutral" | null;
  reviewedAt: string;
  messageId?: string;
  chatId?: string;
  book?: {
    id: number;
    title: string;
    author: string | null;
    coverUrl: string | null;
  } | null;
}

export interface Reviewer {
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  totalReviews: number;
  sentiments: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface LeaderboardEntry {
  rank: number;
  telegramUserId: string;
  username: string | null;
  displayName: string | null;
  reviewCount: number;
}

export interface BookLeaderboardEntry {
  rank: number;
  bookId: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  reviewCount: number;
}

export async function getBooks(options?: {
  sortBy?: "reviewCount" | "recentlyReviewed" | "alphabetical";
  genre?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ books: Book[] }> {
  const params = new URLSearchParams();
  if (options?.sortBy) params.set("sortBy", options.sortBy);
  if (options?.genre) params.set("genre", options.genre);
  if (options?.search) params.set("search", options.search);
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.offset) params.set("offset", options.offset.toString());

  const query = params.toString();
  return fetchApi(`/books${query ? `?${query}` : ""}`);
}

export async function getBook(id: number): Promise<{ book: BookDetail; reviews: Review[] }> {
  return fetchApi(`/books/${id}`);
}

export async function searchBooks(query: string): Promise<{ books: Book[] }> {
  return fetchApi(`/books/search?q=${encodeURIComponent(query)}`);
}

export async function getReviewer(userId: string): Promise<{ reviewer: Reviewer; reviews: Review[] }> {
  return fetchApi(`/reviewers/${userId}`);
}

export async function getMonthlyLeaderboard(options?: {
  year?: number;
  month?: number;
  limit?: number;
}): Promise<{
  period: { type: "monthly"; year: number; month: number };
  leaderboard: LeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.month) params.set("month", options.month.toString());
  if (options?.limit) params.set("limit", options.limit.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/monthly${query ? `?${query}` : ""}`);
}

export async function getYearlyLeaderboard(options?: {
  year?: number;
  limit?: number;
}): Promise<{
  period: { type: "yearly"; year: number };
  leaderboard: LeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.limit) params.set("limit", options.limit.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/yearly${query ? `?${query}` : ""}`);
}

export async function getBookLeaderboard(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  leaderboard: BookLeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.offset) params.set("offset", options.offset.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/books${query ? `?${query}` : ""}`);
}

export async function getMonthlyBookLeaderboard(options?: {
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  period: { type: "monthly"; year: number; month: number };
  leaderboard: BookLeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.month) params.set("month", options.month.toString());
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.offset) params.set("offset", options.offset.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/books/monthly${query ? `?${query}` : ""}`);
}

export async function getYearlyBookLeaderboard(options?: {
  year?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  period: { type: "yearly"; year: number };
  leaderboard: BookLeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.offset) params.set("offset", options.offset.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/books/yearly${query ? `?${query}` : ""}`);
}

export async function getReviewersLeaderboard(limit?: number): Promise<{
  leaderboard: LeaderboardEntry[];
}> {
  const query = limit ? `?limit=${limit}` : "";
  return fetchApi(`/leaderboard/reviewers${query}`);
}

export async function getMonthlyReviewersLeaderboard(options?: {
  year?: number;
  month?: number;
  limit?: number;
}): Promise<{
  period: { type: "monthly"; year: number; month: number };
  leaderboard: LeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.month) params.set("month", options.month.toString());
  if (options?.limit) params.set("limit", options.limit.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/reviewers/monthly${query ? `?${query}` : ""}`);
}

export async function getYearlyReviewersLeaderboard(options?: {
  year?: number;
  limit?: number;
}): Promise<{
  period: { type: "yearly"; year: number };
  leaderboard: LeaderboardEntry[];
}> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", options.year.toString());
  if (options?.limit) params.set("limit", options.limit.toString());

  const query = params.toString();
  return fetchApi(`/leaderboard/reviewers/yearly${query ? `?${query}` : ""}`);
}

export async function getStats(): Promise<{
  booksCount: number;
  reviewsCount: number;
  reviewersCount: number;
}> {
  return fetchApi("/stats");
}

export async function getRandomReviews(limit?: number): Promise<{ reviews: Review[] }> {
  const query = limit ? `?limit=${limit}` : "";
  return fetchApi(`/reviews/random${query}`);
}

export async function getRecentReviews(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ reviews: Review[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.offset) params.set("offset", options.offset.toString());

  const query = params.toString();
  return fetchApi(`/reviews/recent${query ? `?${query}` : ""}`);
}
