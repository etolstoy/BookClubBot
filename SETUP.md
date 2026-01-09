# Local Setup and Testing Guide

This guide will help you set up and test the Telegram Book Club Bot on your local machine.

## Prerequisites

Before you begin, make sure you have:

- **Node.js** v20.0.0 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- A **Telegram account** to create a bot
- An **OpenAI API key** ([Get one here](https://platform.openai.com/api-keys))
- (Optional) A **Google Books API key** ([Get one here](https://developers.google.com/books/docs/v1/using#APIKey))

## Step-by-Step Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to the project directory
cd BookClubBot

# Install backend dependencies
npm install

# Install frontend (Mini App) dependencies
cd mini-app
npm install
cd ..
```

### 2. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow the prompts:
   - Choose a name for your bot (e.g., "My Book Club Bot")
   - Choose a username (must end in 'bot', e.g., "mybookclub_bot")
4. **Save the bot token** - you'll need it in the next step
5. Send `/setdomain` to BotFather and set `https://localhost` for local testing

### 3. Get Your Chat ID (Optional but Recommended for Testing)

1. Add your bot to a Telegram group or use a personal chat
2. Send a message to the bot or group
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id":` in the response - this is your `TARGET_CHAT_ID`
   - For groups, it will be negative (e.g., `-1001234567890`)
   - For private chats, it will be positive (e.g., `123456789`)

### 4. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Open .env in your text editor
nano .env
# or
code .env
```

Update the following values in `.env`:

```env
# Telegram
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz  # Your bot token from BotFather
MINI_APP_URL=http://localhost:5173               # Default Vite dev server URL

# Database
DATABASE_URL=file:./data/bookclub.db             # Keep as is for local SQLite

# External APIs
OPENAI_API_KEY=sk-...                            # Your OpenAI API key
GOOGLE_BOOKS_API_KEY=AIzaSy...                   # (Optional) Your Google Books API key

# App Config
TARGET_CHAT_ID=-1001234567890                    # Your chat ID from step 3
REVIEW_HASHTAG=#рецензия                         # Hashtag to detect reviews (default)

# Server
PORT=3001                                        # API server port
NODE_ENV=development                             # Keep as development
```

### 5. Set Up the Database

```bash
# Generate Prisma client
npx prisma generate

# Create the database and run migrations
npx prisma db push

# Verify the database was created
ls -la data/
# You should see bookclub.db
```

### 6. Build the Backend

```bash
# Compile TypeScript to JavaScript
npm run build

# Verify the build succeeded
ls -la dist/
# You should see compiled JavaScript files
```

### 7. Start the Application

Open **three separate terminal windows**:

**Terminal 1 - Backend (Bot + API Server):**
```bash
npm run dev
```
You should see:
```
API server listening on port 3001
Bot started successfully
```

**Terminal 2 - Frontend (Mini App):**
```bash
cd mini-app
npm run dev
```
You should see:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

**Terminal 3 - Testing (keep this open for commands)**

## Testing the Bot

### Test 1: Health Check

Check if the API server is running:

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-01-09T..."}
```

### Test 2: Bot Commands

1. Open Telegram and find your bot
2. Send `/start` - you should get a welcome message
3. Send `/help` - you should see available commands

### Test 3: Submit a Book Review

There are two ways to test review submission:

**Option A: Using Hashtag (in a group)**
1. Add your bot to a group chat
2. Make sure the group chat ID matches `TARGET_CHAT_ID` in your `.env`
3. Send a message like:
   ```
   #рецензия "The Great Gatsby" by F. Scott Fitzgerald

   This is an amazing book about the American Dream. The prose is beautiful and the characters are complex.
   ```

**Option B: Using /review Command**
1. Send this command to your bot:
   ```
   /review "1984" by George Orwell

   A dystopian masterpiece that remains relevant today. Orwell's vision of totalitarianism is chilling.
   ```

The bot should:
- Show a "Processing..." message
- Extract the book information using OpenAI
- Fetch book details from Google Books API (if configured)
- Save the review to the database
- Send a confirmation message with a link to the Mini App

### Test 4: View Books in Mini App

1. Open your browser to `http://localhost:5173`
2. You should see the Mini App interface
3. Navigate through:
   - **Catalog** - See all reviewed books
   - **Search** - Search for books
   - **Leaderboard** - See top reviewers
   - **Profile** - View reviewer profiles

### Test 5: API Endpoints

Test the REST API directly:

```bash
# Get all books
curl http://localhost:3001/api/books

# Search for a book
curl "http://localhost:3001/api/books/search?q=gatsby"

# Get book details (replace 1 with actual book ID)
curl http://localhost:3001/api/books/1

# Get leaderboard
curl http://localhost:3001/api/leaderboard/monthly
```

## Common Issues and Solutions

### Issue: "BOT_TOKEN is required"
**Solution:** Make sure your `.env` file exists and has the correct `BOT_TOKEN` value.

### Issue: "EADDRINUSE: address already in use :::3001"
**Solution:** Port 3001 is already taken. Either:
- Stop the other process using port 3001
- Change `PORT` in `.env` to a different port (e.g., 3002)

### Issue: Bot doesn't respond to messages
**Solution:**
1. Check that `npm run dev` is running without errors
2. Verify your `BOT_TOKEN` is correct
3. Make sure the bot is added to the group (for hashtag reviews)
4. Check that `TARGET_CHAT_ID` matches your chat/group ID

### Issue: "OpenAI API error"
**Solution:**
1. Verify your `OPENAI_API_KEY` is valid
2. Check you have credits in your OpenAI account
3. Ensure you're using a valid API key (starts with `sk-`)

### Issue: Database errors
**Solution:**
```bash
# Delete the database and recreate it
rm -rf data/bookclub.db
npx prisma db push
```

### Issue: Mini App shows blank page
**Solution:**
1. Check that `npm run dev` is running in the mini-app directory
2. Open browser console (F12) to see any JavaScript errors
3. Verify the API is accessible at `http://localhost:3001/api/health`

## Stopping the Application

Press `Ctrl+C` in each terminal window to stop:
1. Backend server (Terminal 1)
2. Mini App dev server (Terminal 2)

## Next Steps

### Production Deployment
For production deployment, see `.github/workflows/deploy.yml` for the CI/CD setup.

### Adding Features
- Modify bot handlers in `src/bot/handlers/`
- Update API routes in `src/api/routes/`
- Enhance the Mini App in `mini-app/src/`

### Database Management
```bash
# View database in Prisma Studio
npx prisma studio

# Create a migration (for production)
npx prisma migrate dev --name your_migration_name

# Reset database
npx prisma migrate reset
```

## Useful Commands

```bash
# Backend
npm run dev          # Start with hot reload
npm run build        # Build TypeScript
npm start            # Run production build
npm run typecheck    # Check TypeScript types

# Database
npx prisma generate  # Generate Prisma client
npx prisma db push   # Push schema to database
npx prisma studio    # Open database GUI

# Frontend (in mini-app/)
npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm run preview      # Preview production build
```

## Need Help?

If you encounter issues not covered here:
1. Check the error messages in the terminal
2. Review the `.env` file for correct values
3. Check the bot logs for detailed error information
4. Verify all prerequisites are installed correctly
