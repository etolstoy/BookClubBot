# BookClub Bot

A Telegram bot and mini-app for tracking book reviews with sentiment analysis, automatic book detection and enrichment, and leaderboards, perfect for local book clubs.

## Features

- **Smart Review Processing**: Submit reviews via special hashtag or `/review` command
- **AI Book Extraction**: GPT-4o automatically extracts book information from review text
- **Interactive Confirmation**: Choose from matched books, enter ISBN, or add manually
- **Sentiment Analysis**: Automatic positive/negative/neutral classification
- **Mini App Frontend**: Browse books, view reviews, explore leaderboards
- **Book Enrichment**: Automatic metadata fetching from Google Books API

## Architecture

The system consists of three main components:

### 1. Telegram Bot (`src/bot/`)
- Monitors target chat for a special hashtag
- Handles `/review` command in any chat
- Interactive book confirmation flow with inline keyboards
- State management for multi-step user interactions

### 2. Express API Server (`src/api/`)
- REST API for Mini App data access
- Book and review CRUD operations
- Leaderboard endpoints (monthly/yearly/overall)
- Statistics aggregation

### 3. Mini App Frontend (`mini-app/`)
- React + Vite SPA served as Telegram Web App
- Browse books and reviews
- View leaderboards and statistics
- Responsive design for mobile

All components start together via `npm run dev`.

## Local Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Telegram account
- OpenAI API key

### Quick Start

1. **Create Telegram Bot**
   ```bash
   # Talk to @BotFather on Telegram
   # Use /newbot to create bot and get BOT_TOKEN
   # Use /setdomain and set to https://localhost for local testing
   ```

2. **Get Chat IDs**
   ```bash
   # Send message to your bot or group
   # Visit: https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   # Copy chat ID from response
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env and set:
   # - BOT_TOKEN (required)
   # - OPENAI_API_KEY (required)
   # - GOOGLE_BOOKS_API_KEY (optional)
   # - TARGET_CHAT_ID (chat where bot monitors for #рецензия)
   # - ADMIN_CHAT_ID (for error notifications)
   ```

4. **Install Dependencies**
   ```bash
   # Backend
   npm install

   # Frontend
   cd mini-app && npm install && cd ..
   ```

5. **Setup Database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

6. **Start Development**
   ```bash
   # Terminal 1: Backend (bot + API)
   npm run dev

   # Terminal 2: Frontend (Mini App)
   cd mini-app && npm run dev
   ```

7. **Test the Bot**
   - Send `/start` to your bot in Telegram
   - Post a message with `#рецензия` in your target chat
   - Or use `/review` as a reply to any message with book info

## Usage

### Submit a Review

**Method 1: Hashtag (Target Chat Only)**
```
#рецензия Just finished "The Great Gatsby" by F. Scott Fitzgerald.
Amazing portrayal of the American Dream...
```

**Method 2: Command (Any Chat)**
```
/review The Great Gatsby — F. Scott Fitzgerald
[Reply to this message with your review text]
```

### Bot Workflow

1. Bot extracts book information using GPT-4o
2. Shows matched books with inline keyboard
3. You select the correct book or:
   - Enter ISBN for precise lookup
   - Enter title and author manually
4. Bot analyzes sentiment (positive/negative/neutral)
5. Review is saved and Mini App link is sent

### Mini App

Access via bot menu button or deep links:
- Browse all books
- Read reviews with sentiment filters
- View leaderboards (top books, top reviewers)
- See reviewer profiles with statistics

## Development Commands

### Backend
```bash
npm run dev          # Development with hot reload
npm run build        # Build TypeScript
npm start            # Run production build
npm run typecheck    # Type checking
```

### Database
```bash
npx prisma generate  # Generate Prisma Client
npx prisma db push   # Push schema to database
npx prisma studio    # Open database GUI
```

### Frontend
```bash
cd mini-app
npm run dev          # Development server
npm run build        # Production build
npm run preview      # Preview production build
```

## Tech Stack

- **Backend**: TypeScript, Node.js, Express, Telegraf
- **Frontend**: React, Vite, TypeScript, Telegram Mini Apps SDK
- **Database**: SQLite with Prisma ORM
- **AI**: OpenAI (GPT-4o for extraction, GPT-4o-mini for sentiment)
- **APIs**: Google Books API for book metadata

## Deployment

Production deployment uses Docker Compose with automatic HTTPS via Caddy. See `.github/workflows/deploy.yml` for CI/CD pipeline.

## License

MIT
