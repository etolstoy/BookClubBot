## Overview
Enable active users to continuously enhance the library – add missing meta-information to books, re-link reviews when needed. Chat members can edit books and reviews directly (same as admins), with full audit trail via admin notifications.

## What Needs Help

### Books need help if:
- Missing metadata: cover, goodreads link, or author (ISBN/Google Books optional)

### Reviews need help if:
- Not linked to a book (`bookId = null`, occurs when matching fails during creation)

### Help Counter Logic
Entry point label counts items using same logic as volunteer screen:
- Books missing any metadata (cover/author/goodreads)
- Reviews not linked to any book

## User Interface

### Entry Point (Main Screen)
- Below stats label: "X книг и Y рецензий нужна ваша помощь"
- Text button: "Погнали!"
- Hidden completely for non-chat-members (membership checked on Mini App init, stored in token)
- No deep linking - only accessible via main screen button

### Volunteer Screen
- Combined view (books and reviews mixed, no tabs)
- Total count at top: "Нужна помощь: 47 книг/рецензий"
- Pagination (consistent with other screens)
- Sort by popularity (most-reviewed books first)

### Book/Review Cards
- Same style as other screens
- Missing fields shown as tags/chips below card: "Нет обложки", "Нет Goodreads", "Нет автора"
- Text link "Редактировать" on each card

## Direct Edit System

### Edit Permissions
- Chat members can edit any book/review (same permissions as admins)
- Reuse existing `EditBookModal` and `EditReviewModal` components
- Existing API endpoints: `PATCH /api/books/:id` and `PATCH /api/reviews/:id`
- No queue, no approval workflow - changes apply immediately

### Editable Fields (Books)
- Title
- Author
- ISBN
- Cover URL
- Description
- Publication Year
- Page Count
- Goodreads URL
- "Sync with Google Books" button (auto-populate from ISBN)

### Review Linking
- For unlinked reviews: reuse existing book confirmation flow
- User can search existing books or create new book
- Review text remains editable by owner

### Admin Notifications
**Critical**: Every book/review edit by non-admin triggers notification to `ADMIN_CHAT_ID` with:
- Editor info: username, display name, user ID
- **Full before/after state**: show all fields that changed with old → new values
- Timestamp of edit
- Deep link to edited book/review in Mini App
- Format example:
  ```
  📝 Book Edited by @username (John Doe, ID: 123456789)

  Book: "The Great Gatsby"

  Changes:
  • Author: empty → F. Scott Fitzgerald
  • Cover URL: empty → https://example.com/cover.jpg
  • Goodreads URL: https://old-link → https://new-link

  🔗 View book: [link]

  ⏰ 2026-01-30 14:35:22
  ```

### Audit Trail
- All edits logged in admin chat (existing notification service)
- Admins can manually revert bad edits using same edit interface
- No automated rollback - trust community with manual oversight

## Access Control
- Volunteer screen: chat members only (verified on Mini App init)
- Edit permissions: chat members can edit any book/review
- Delete permissions: remain admin-only (existing behavior)
- Review authors can edit their own reviews (existing behavior)

## API Design

### Endpoints (Reuse Existing)
- `GET /api/books?needsHelp=true` - list books needing help (filter by missing fields)
- `GET /api/reviews?needsHelp=true` - list unlinked reviews (filter by `bookId = null`)
- `PATCH /api/books/:id` - **update permission check**: allow chat members (not just admins)
- `PATCH /api/reviews/:id` - **update permission check**: allow chat members (not just admins)

### New Helper Endpoint
- `GET /api/volunteer/stats` - return counts for entry point label: `{ booksNeedingHelp: number, reviewsNeedingHelp: number }`

## Technical Considerations

### Permission Changes
Update authorization checks in:
- `src/api/routes/books.ts` (PATCH handler)
- `src/api/routes/reviews.ts` (PATCH handler)

Change from:
```typescript
if (!isAdmin(user.telegramUserId)) {
  return res.status(403).json({ error: 'Admin access required' })
}
```

To:
```typescript
if (!isAdmin(user.telegramUserId) && !isChatMember(user.telegramUserId)) {
  return res.status(403).json({ error: 'Chat membership required' })
}
```

### Chat Membership Verification
- Check membership on Mini App init (bot API: `telegram.getChatMember()`)
- Cache membership status in auth token payload
- Frontend hides volunteer features for non-members
- Backend validates membership on edit endpoints

### Admin Notification Enhancement
Extend existing `notification.service.ts` to include full before/after state:
- Capture original entity state before update
- After successful update, compare old vs new
- Format message with all changed fields
- Include editor identity (non-admin user)
- Send to `ADMIN_CHAT_ID`

### Database Changes
**None required** - reuse existing schema. No new models, no new fields.

### Frontend Changes
- Add volunteer screen route: `/volunteer`
- Add entry point button on main screen (conditional on chat membership)
- Update `EditBookModal` permission logic to allow chat members
- Update `EditReviewModal` permission logic to allow chat members
- Add volunteer stats API call for counter

### Modularity
- Keep volunteer screen as standalone component
- Minimal coupling with existing code (only permission checks change)
- Easy to disable by hiding entry point and reverting permission changes
