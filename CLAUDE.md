# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Telegram bot that tracks book reviews with sentiment analysis and leaderboards. Reviews are submitted via hashtags or commands, processed by OpenAI to extract book information, and enriched with Google Books API data. The system includes a Mini App (Telegram Web App) frontend for viewing reviews, leaderboards, and book catalogs.

## Architecture

### Three-Tier System

1. **Telegram Bot** (`src/bot/`): Listens for review hashtags/commands, processes messages
2. **Express API Server** (`src/api/`): REST API for Mini App and data access
3. **Mini App Frontend** (`mini-app/`): React/Vite SPA served as Telegram Web App

All three components start together via `src/index.ts`:
- Bot initialization and message handlers
- Express server with API routes
- Mini App served separately (dev: Vite, prod: static build)

### Key Services

- **LLM Service** (`src/services/llm.ts`): OpenAI integration for extracting book title/author from review text. Falls back to regex patterns if OpenAI fails/rate-limits.
- **Book Service** (`src/services/book.service.ts`): Manages book lookup/creation, integrates with Google Books API for metadata enrichment
- **Review Service** (`src/services/review.service.ts`): Handles review creation, duplicate detection, statistics aggregation
- **Notification Service** (`src/services/notification.service.ts`): Sends errors/warnings to admin chat for observability
- **Sentiment Analysis** (`src/services/sentiment.ts`): Classifies reviews as positive/negative/neutral

### Data Flow for Review Processing

1. User posts message with `REVIEW_HASHTAG` (default: `#рецензия`) or replies with `/review` command
2. `handleReviewMessage`/`handleReviewCommand` in `src/bot/handlers/review.ts` validates and calls `processAndCreateReview`
3. `processReviewText` extracts book info via OpenAI (with regex fallback) → searches Google Books API → creates/finds Book record
4. Sentiment analysis runs on review text
5. Review saved to DB with book association
6. User receives confirmation with deep link to Mini App book page

### Database Schema (Prisma + SQLite)

- **Book**: Stores book metadata (title, author, Google Books ID, cover, genres, etc.)
- **Review**: Links users to books with review text, sentiment, Telegram message metadata

Important: Uses SQLite with `better-sqlite3`. BigInt fields for Telegram IDs (userId, chatId, messageId).

### Configuration

All configuration is centralized in `src/lib/config.ts`, loaded from environment variables:

- `BOT_TOKEN`: Telegram bot token (required)
- `OPENAI_API_KEY`: OpenAI API key for book extraction (required)
- `GOOGLE_BOOKS_API_KEY`: Google Books API key (optional, improves book metadata)
- `TARGET_CHAT_ID`: Chat where bot monitors for review hashtags
- `ADMIN_CHAT_ID`: Chat for error/warning notifications
- `REVIEW_HASHTAG`: Hashtag that triggers review processing (default: `#рецензия`)
- `DATABASE_URL`: SQLite database path (default: `file:./data/bookclub.db`)
- `MINI_APP_URL`: Mini App URL for deep links
- `PORT`: API server port (default: 3001)
- `NODE_ENV`: Environment (development/production)

### Error Handling & Observability

The notification service sends errors and warnings to `ADMIN_CHAT_ID`:
- Critical: OpenAI rate limits/quota exceeded
- Warnings: OpenAI failures (falls back to regex)
- Errors: Application startup failures, unexpected errors

When debugging issues, check notification service calls and admin chat logs.

## Development Commands

### Backend (Root Directory)

```bash
# Development with hot reload
npm run dev

# Build TypeScript to dist/
npm run build

# Run production build
npm start

# Type checking without building
npm run typecheck
```

### Database (Prisma)

```bash
# Generate Prisma Client (required after schema changes)
npx prisma generate

# Push schema to database (for development/local)
npx prisma db push

# Create a migration (for production schema changes)
npx prisma migrate dev --name migration_name

# Open database GUI
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Frontend (mini-app/)

```bash
cd mini-app

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Import Archive Data

```bash
npm run import
```

Uses `scripts/import-archive.ts` to import historical review data.

## Testing

### Local Setup

1. Create Telegram bot via @BotFather, get token
2. Get chat IDs: send message to bot/group, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Set `/setdomain` to `https://localhost` in BotFather for local Mini App testing
4. Copy `.env.example` to `.env` and configure all variables
5. Run database setup: `npx prisma generate && npx prisma db push`
6. Build backend: `npm run build`
7. Start three processes:
   - Terminal 1: `npm run dev` (backend)
   - Terminal 2: `cd mini-app && npm run dev` (frontend)
   - Terminal 3: Test commands

### Manual Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Get books
curl http://localhost:3001/api/books

# Search books
curl "http://localhost:3001/api/books/search?q=gatsby"

# Get book by ID
curl http://localhost:3001/api/books/1

# Get leaderboard
curl http://localhost:3001/api/leaderboard/monthly
```

Test in Telegram:
1. `/start` - Welcome message
2. `/help` - Command list
3. Post message with `#рецензия` + book review text in target chat
4. Or use `/review` as reply to any message containing book info

### Review Message Format

The bot expects review text to mention a book. Common patterns:
- `"Title" by Author`
- `«Title» by Author`
- `"Title" - Author`
- Any quoted text (assumes it's a title)

If OpenAI fails to extract, regex fallback attempts these patterns.

## Deployment

Production deployment uses Docker Compose with three services:
- `bot`: Backend (Telegram bot + API server)
- `mini-app`: Frontend (static build served by Caddy)
- `caddy`: Reverse proxy with automatic HTTPS

See `.github/workflows/deploy.yml` for CI/CD pipeline.

Set `DOMAIN` environment variable for production domain (used by Caddy for SSL).

## Important Development Notes

### Telegram Bot Behavior

- Bot only processes messages in `TARGET_CHAT_ID` when using hashtag detection
- `/review` command works in any chat where bot is present
- Bot needs to be added to groups to read messages
- Deep links format: `https://t.me/botusername?startapp=book_{bookId}`

### OpenAI Integration

- Uses `gpt-4o-mini` for cost efficiency
- JSON response format enforced
- Always falls back to regex if API fails
- Rate limit/quota errors trigger admin notifications
- Regex patterns support both English and Russian (Cyrillic) text

### BigInt Handling

Telegram IDs exceed JavaScript's safe integer range. All Telegram IDs (userId, chatId, messageId) are stored as `BigInt` in the database and must be converted to/from strings when serializing JSON.

### File Extensions

This is an ES Module project (type: "module" in package.json). All imports must use `.js` extensions even for TypeScript files (TypeScript compiler rewrites them correctly). Example: `import { foo } from "./bar.js"` not `"./bar"`.

### Goodreads Integration

Books are linked to Goodreads dynamically. The URL is computed using title and author via `getGoodreadsUrl()` in the book service (not stored in database).
