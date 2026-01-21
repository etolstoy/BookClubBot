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

- **Book Extraction Service** (`src/services/book-extraction.service.ts`): LLM-based extraction of primary book and alternative books from review text. Returns confidence scores (high/medium/low) and handles command parameters like `/review Title — Author`. Uses OpenAI client implementation.
- **Book Enrichment Service** (`src/services/book-enrichment.service.ts`): Searches for book matches using 90% similarity threshold for both title AND author independently. Searches local database first, then queries external book API only for unmatched books. Returns top 3 deduplicated results sorted by similarity score.
- **Book Service** (`src/services/book.service.ts`): Manages book CRUD operations, book creation with external API enrichment, similarity-based matching, and dynamic URL generation for Google Books and Goodreads (URLs computed on-the-fly, not stored).
- **Review Service** (`src/services/review.service.ts`): Handles review creation, duplicate detection, sentiment assignment, statistics aggregation, and leaderboards (monthly/yearly/overall/last30/last365 days).
- **Notification Service** (`src/services/notification.service.ts`): Sends formatted notifications to admin chat with emoji, error details, timestamps, and stack traces (in development mode).
- **Sentiment Analysis** (`src/services/sentiment.ts`): LLM-based sentiment classification (positive/negative/neutral).

### Data Flow for Review Processing

1. **User Input**: User posts message with `#рецензия` hashtag in target chat, or replies with `/review` command in any chat
2. **Validation**: `handleReviewMessage`/`handleReviewCommand` in `src/bot/handlers/review.ts` checks for:
   - Duplicate reviews (same telegramUserId + messageId)
   - Existing pending confirmation state (prevents overlapping confirmations)
3. **Book Extraction**: LLM extracts primary book and alternative books from review text via `book-extraction.service.ts`
   - Returns confidence scores (high/medium/low) for each book
   - If extraction fails → shows manual entry options (enter book info or cancel)
4. **Book Enrichment**: `book-enrichment.service.ts` finds matching books:
   - Searches local database with 90% similarity threshold (title AND author)
   - Queries external book API for unmatched books
   - Deduplicates and returns top 3 results sorted by similarity
5. **Confirmation Flow**: Bot enters state machine managed by `book-confirmation.ts`:
   - Stores state in memory with 15-minute timeout (auto-cleanup every 5 minutes)
   - Shows inline keyboard with options:
     - Select from matched books (up to 3 options)
     - Enter ISBN for precise lookup
     - Enter book info manually (title → author → confirmation)
     - Cancel and delete confirmation state
6. **User Selection**: User interacts with inline keyboard or sends text input
   - Book selection → proceeds to review creation
   - ISBN entry → searches external book API → shows confirmation
   - Manual entry → sequential prompts for title and author → shows confirmation
   - Cancel → cleans up state and exits flow
7. **Review Creation**: After book confirmation:
   - Sentiment analysis runs via LLM
   - Review saved to database with book association
   - User receives success message with deep link to Mini App book page
8. **State Cleanup**: Confirmation state is removed from memory after completion or 15-minute timeout

### Database Schema (Prisma + SQLite)

- **Book**: Stores book metadata (title, author, Google Books ID, cover, genres, etc.)
- **Review**: Links users to books with review text, sentiment, Telegram message metadata

Important: Uses SQLite with `better-sqlite3`. BigInt fields for Telegram IDs (userId, chatId, messageId).

### Configuration

All configuration is centralized in `src/lib/config.ts`, loaded from environment variables:

- `BOT_TOKEN`: Telegram bot token (required)
- `OPENAI_API_KEY`: OpenAI API key for book extraction and sentiment analysis (required)
- `GOOGLE_BOOKS_API_KEY`: Google Books API key (optional, improves book metadata)
- `TARGET_CHAT_ID`: Chat where bot monitors for review hashtags (bot watches for `#рецензия`)
- `ADMIN_CHAT_ID`: Chat for error/warning notifications
- `ADMIN_USER_IDS`: Comma-separated list of admin user IDs for privileged operations
- `DATABASE_URL`: SQLite database path (default: `file:./data/bookclub.db`)
- `MINI_APP_URL`: Mini App URL for deep links (default: `http://localhost:3000`)
- `PORT`: API server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `GOOGLE_BOOKS_DELAY_MS`: Delay in milliseconds between Google Books API requests for rate limiting (default: 200)
- `GOOGLE_BOOKS_MAX_RETRIES`: Maximum retry attempts for Google Books API rate limit errors (default: 3)

### Error Handling & Observability

The notification service sends errors and warnings to `ADMIN_CHAT_ID`:
- Critical: LLM rate limits/quota exceeded, external book API rate limits
- Warnings: LLM extraction failures, external API failures
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

The LLM extracts book information using these patterns and context clues.

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

### Book Confirmation Flow

The bot implements a sophisticated state machine (`src/bot/handlers/book-confirmation.ts`) for interactive book confirmation:

**State Management:**
- Confirmation states stored in-memory Map (`pendingBookConfirmations`)
- Each state includes: review data, extracted book info, enrichment results, current flow state
- 15-minute timeout with automatic cleanup (runs every 5 minutes)
- New review automatically replaces pending confirmation for same user

**User Interaction Modes:**
1. **Matched Books Selection**: When LLM extraction succeeds and enrichment finds matches
   - Shows up to 3 best-matching books with inline keyboard buttons
   - Displays confidence scores and match quality
   - User selects correct book or chooses alternative input method

2. **ISBN Entry Flow**: For precise book lookup
   - User clicks "Enter ISBN" button
   - Bot prompts for ISBN input
   - Searches Google Books by ISBN
   - Shows book details for confirmation

3. **Manual Entry Flow**: When no matches found or user prefers manual input
   - Sequential prompts: Title → Author → Confirmation
   - Each step validates input and updates state
   - Final confirmation screen shows entered book details

4. **Cancellation**: User can cancel at any point
   - Cleans up confirmation state from memory
   - Exits flow gracefully

**Handler Organization:**
- `book-confirmation.ts` (795 lines): Main state machine, UI generation, input handling
- `book-selection.ts`: Legacy handlers for backward compatibility
- `review.ts`: Entry point, orchestrates confirmation flow initiation

**State Transitions:**
```
AWAITING_SELECTION → [user selects book] → CREATE_REVIEW
AWAITING_SELECTION → [enter ISBN] → AWAITING_ISBN
AWAITING_ISBN → [ISBN provided] → CONFIRMING_ISBN_BOOK
CONFIRMING_ISBN_BOOK → [confirmed] → CREATE_REVIEW
AWAITING_SELECTION → [manual entry] → AWAITING_TITLE
AWAITING_TITLE → [title provided] → AWAITING_AUTHOR
AWAITING_AUTHOR → [author provided] → CONFIRMING_MANUAL_BOOK
CONFIRMING_MANUAL_BOOK → [confirmed] → CREATE_REVIEW
```

### LLM Integration

- Book extraction service uses LLM for extracting book information from review text
- Sentiment analysis service uses LLM for classifying review sentiment
- JSON response format enforced for structured outputs
- Rate limit/quota errors trigger admin notifications via notification service
- Handles command parameters like `/review Title — Author` for direct book specification
- Current implementation uses OpenAI (gpt-4o for extraction, gpt-4o-mini for sentiment)
- Implementation is abstracted via ILLMClient interface for easy swapping

### BigInt Handling

Telegram IDs exceed JavaScript's safe integer range. All Telegram IDs (userId, chatId, messageId) are stored as `BigInt` in the database and must be converted to/from strings when serializing JSON.

### File Extensions

This is an ES Module project (type: "module" in package.json). All imports must use `.js` extensions even for TypeScript files (TypeScript compiler rewrites them correctly). Example: `import { foo } from "./bar.js"` not `"./bar"`.

### Goodreads Integration

Books are linked to Goodreads dynamically. The URL is computed on-the-fly via `getGoodreadsUrl()` in the book service (not stored in database). Prioritizes ISBN-based URLs when available (`/book/isbn/{isbn}`), otherwise generates search URLs using title and author.
