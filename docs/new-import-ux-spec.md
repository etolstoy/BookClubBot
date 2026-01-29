## Overview

Move from the book import flow via interaction with the bot, to import flow via the miniapp.

## Objectives

1. Reduce the number of messages in the chat, and distract subscribers less.
2. Increase the chances the review will be imported without requiring additional steps for a reviewer.
3. Make it easier to enrich book manually.

## User Flow

### Hashtag and Command Handling

1. Pipeline initiates as before – either with `#рецензия` hashtag or with `/review` command (as reply to message).
   - Both hashtag and command are treated identically - same automatic flow
   - **Remove `/review` parameter support** (e.g., `/review Title — Author`) - delete all associated code, conditional logic, and tests
   - Keep reply extraction functionality for `/review` command

### Review Processing

2. Add **👀 reaction** to the review message to indicate processing has started.
   - No chat messages during processing (remove "📖 Извлекаю информацию о книге..." toast)
   - If reaction API fails: notify admin, continue with review creation (don't block)

3. AI extracts book information (title, author, confidence score).
   - **High confidence**: proceed to step 4 (attempt Google Books enrichment, always create book)
   - **Low/medium confidence**: create review WITHOUT book link (skip steps 4-5, go to step 6)
   - Orphaned reviews (no book link) are shown identically to regular reviews in miniapp - no special indicator

### Google Books Enrichment (High Confidence Only)

4. If AI confidence is **high**:
   - Search local DB first with **95%+ similarity threshold** for both title AND author
   - If found in local DB → reuse existing book
   - If NOT found in local DB → Google Books search launches silently
   - Use **95%+ similarity threshold** for both title AND author (stricter than current 90%)
   - No fallback to 90% - strict fail at 95%
   - If Google Books match found → create book with full metadata
   - If no Google Books match → create book with LLM-extracted title/author only

5. **Failure Logging** (step 4 failures):
   - Log minimal data: extracted title and author
   - Store in **monthly-rotated JSON log file** (YYYY-MM.log format)
   - Ensure persistence between Docker restarts (use volume mount)
   - Location: `data/google-books-failures/` directory
   - For analysis and improvement of extraction/matching logic

### Review Creation

6. Review is created in database:
   - If step 4-5 succeeded: review linked to book (with full or minimal metadata)
   - If AI confidence low/medium: review without book link (orphaned)
   - Reviews without book links are discoverable in:
     - "Recent Reviews" section
     - User profile pages
     - NOT in book-specific views (obviously)

7. Add **✅ reaction** to the review message (replace "✅ Рецензия сохранена!" toast).
   - Remove success toast message
   - On reaction failure: notify admin, don't retry

8. If there are **2+ reviews** for the same book (only count reviews WITH book links):
   - Post message with deeplink to book page in miniapp
   - Include sentiment breakdown as before
   - Message format unchanged from current implementation
   - This is the ONLY automated message sent during successful processing

### Error Handling

9. On any error during processing:
   - Add **❌ reaction** to the review message
   - Remove all error toast messages (rate limit, generic errors)
   - Admin gets notified via existing notification service
   - User sees only the ❌ reaction (no context/details)

### Messages to Keep

The following messages should **NOT** be removed:
- Command validation errors (educational, not pipeline status):
  - "/review works only in group chats..."
  - "Please use /review as reply to a message..."
  - "Can't read this message. Ensure it contains text..."
- Duplicate review message: "Эта рецензия уже сохранена!"

## Miniapp Changes

### Edit Review Screen

1. Add **"Create new book"** button to existing edit review screen.
   - Shows when user wants to link a book manually
   - Button opens existing "Edit Book" form with blank fields (title, author)
   - User fills title and author manually
   - User can optionally enrich with Google Books via existing sync button
   - No new UI components - reuse existing edit book screen

## Confirmation Flow Removal

### What to Delete

1. Remove entire confirmation flow state machine:
   - Delete `book-confirmation.ts` state management (in-memory Map, timeouts)
   - Delete `pendingBookConfirmations` and `userToMessageIndex`
   - Delete all confirmation state types and interfaces
   - Delete state storage/retrieval/cleanup functions

2. Remove confirmation UI generation:
   - Delete inline keyboard prompts (select book, enter ISBN, manual entry)
   - Delete sequential prompt flows (title → author → confirmation)
   - Delete `generateOptionsMessage` and related UI helpers

3. Simplify review processing:
   - Remove state checks and confirmation tracking in `review.ts`
   - Remove callback handlers for book selection, ISBN entry, manual entry
   - Streamline `processReview` to: extract → enrich → create (no interactive steps)

4. Clean up tests:
   - Delete tests for confirmation flow state management
   - Delete tests for interactive prompts and callbacks
   - Delete mocks of confirmation state
   - Update remaining tests to reflect new simplified flow

### What to Keep

- Review message handlers (`handleReviewMessage`, `handleReviewCommand`)
- Book extraction and enrichment service calls
- Review creation and sentiment analysis
- Error handling and validation

## Testing Strategy

Use TDD approach with comprehensive test coverage:

1. **Integration tests** (with mocked clients):
   - Mock AI client (CascadingOpenAIClient) for confidence levels
   - Mock book data client (Google Books API)
   - Test full flow: hashtag/command → extraction → enrichment → review creation
   - Verify correct data persisted in database

2. **Reaction tests**:
   - Test 👀 reaction added at start of processing
   - Test ✅ reaction added on success
   - Test ❌ reaction added on error
   - Test admin notification when reactions fail

3. **Confidence branching tests**:
   - High confidence → creates review with book link
   - Low/medium confidence → creates review without book link
   - High confidence + Google Books failure → creates review without book link

4. **Google Books failure logging tests**:
   - Verify failures logged to correct monthly file
   - Verify log format (minimal: title, author)
   - Verify log rotation (new file per month)

5. **Edge cases**:
   - Duplicate review detection still works
   - Multiple reviews message posted correctly (only for linked reviews)
   - Command validation errors still shown

## Implementation Notes

### Rollout Strategy
- **Hard cutover**: deploy and switch entirely (no feature flags)
- Single PR with all changes
- No gradual migration or A/B testing

### Performance
- No rate limiting needed for review creation
- Database (SQLite + Prisma) can handle rapid submissions
- Trust existing duplicate detection (telegramUserId + messageId)

### Log Rotation
- Monthly rotation: `YYYY-MM.log` format
- Append-only JSON lines (one failure per line)
- Persistent volume mount: `./data/google-books-failures/`
- No automatic cleanup (manual analysis/deletion)

### Reactions
- Emoji: 👀 (processing), ✅ (success), ❌ (error)
- Non-blocking: continue processing even if reaction fails
- Admin notification on reaction API failures

### Google Books
- Only search when AI confidence is HIGH
- Skip search entirely for low/medium confidence
- 95% similarity threshold (both title AND author)
- No fallback to looser matching
- Log all failures for future analysis

## Summary of Changes

### Backend (Bot)
- ✅ Remove confirmation flow entirely (state management, UI, handlers)
- ✅ Add reaction system (👀, ✅, ❌) to replace chat messages
- ✅ Implement confidence-based auto-creation (high → with book, low/medium → without book)
- ✅ Update Google Books search: 95% threshold, high confidence only
- ✅ Add failure logging: monthly-rotated JSON file
- ✅ Remove `/review` parameter parsing
- ✅ Remove toasts: processing, success, errors
- ✅ Keep: command validation, duplicate message, multiple reviews message
- ✅ Simplify codebase: delete redundant code and tests

### Miniapp (Frontend)
- ✅ Add "Create new book" button to edit review screen
- ✅ Button opens existing edit book form (blank)
- ✅ No changes to orphaned review display

### Testing
- ✅ Integration tests with mocked AI/book clients
- ✅ Reaction addition tests
- ✅ Confidence branching tests
- ✅ Google Books failure logging tests
- ✅ Edge case coverage

### Infrastructure
- ✅ Add volume mount for log persistence: `./data/google-books-failures/`
- ✅ Monthly log rotation logic
