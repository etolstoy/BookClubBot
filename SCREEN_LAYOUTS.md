# Book Club Mini App - Screen Layouts Design Specification

A Telegram Mini App for a book club community to browse books, read reviews, and view leaderboards. The app uses Telegram's native theme colors for seamless integration.

---

## Design System

### Color Palette (Telegram Theme Variables)
- **Background** (`tg-bg`): Main app background
- **Text** (`tg-text`): Primary text color
- **Hint** (`tg-hint`): Secondary/muted text color
- **Link** (`tg-link`): Clickable link color
- **Button** (`tg-button`): Primary button background
- **Button Text** (`tg-button-text`): Primary button text color
- **Secondary** (`tg-secondary`): Card backgrounds, input fields

### Typography
- **Page Title**: 24px, bold
- **Section Title**: 20px, bold
- **Card Title**: 16px, semibold
- **Body Text**: 14px, regular
- **Hint Text**: 12-14px, regular, muted color

### Spacing
- **Page Padding**: 16px all sides
- **Card Padding**: 16px
- **Component Gap**: 12px (small), 16px (medium), 24px (large)
- **Border Radius**: 8px (cards, buttons, inputs)

### Sentiment Indicators
- **Positive**: 👍 emoji
- **Negative**: 👎 emoji
- **Neutral**: 😐 emoji

---

## Screen 1: Home

**Route**: `/`

### Layout Structure (Top to Bottom)

1. **Page Title**
   - Text: "Book Club"
   - Style: 24px bold, primary text color
   - Bottom margin: 24px

2. **Search Bar**
   - Full-width horizontal flex container
   - Input field (flex: 1): rounded, secondary background, placeholder "Search books..."
   - Search button: primary button style, text "Search"
   - Bottom margin: 16px

3. **Statistics Line**
   - Single line of hint-colored text
   - Format: "We have X books, Y reviews and Z reviewers"
   - Bottom margin: 32px

4. **Recent Reviews Section**
   - Section title: "Recent Reviews" (20px bold)
   - Horizontal scrolling carousel (snap-to-card behavior)
   - Cards extend beyond viewport with horizontal scroll
   - Bottom margin: 32px

   **Review Card in Carousel** (each card):
   - Width: 85% of viewport, max 448px
   - Height: 280px fixed
   - Background: secondary color
   - Border radius: 8px
   - Padding: 16px
   - Layout:
     ```
     ┌────────────────────────────────────────┐
     │ [Reviewer Name]        [👍] [Jan 5, 2026]│
     │                                        │
     │ [Cover] Title by Author                │
     │  32x48                                 │
     │                                        │
     │ Review text preview (max 6 lines,      │
     │ truncated with ellipsis...)            │
     │                                        │
     │                          Read more →   │
     └────────────────────────────────────────┘
     ```
   - Reviewer name: link color, clickable
   - Book info row: small cover (32x48px), title in link color, author in hint color
   - Review text: regular text, line-clamped to 6 lines
   - "Read more →" link at bottom right

5. **Navigation Grid**
   - 2x2 grid layout with 12px gap
   - Each button:
     - Full width of grid cell
     - Padding: 16px horizontal, 24px vertical
     - Background: primary button color
     - Text: button text color, centered, medium weight
     - Border radius: 8px
   - Buttons:
     ```
     ┌─────────────┬─────────────┐
     │ 📚 Top Books│🏆 Top       │
     │             │   Reviewers │
     ├─────────────┼─────────────┤
     │ ⭐ Fresh    │📖 Browse All│
     │   Reviews   │    Books    │
     └─────────────┴─────────────┘
     ```

---

## Screen 2: Browse Books

**Route**: `/browse` or `/browse?q=searchterm`

### Layout Structure

1. **Back Link**
   - Text: "← Back to home"
   - Style: link color, underline on hover
   - Bottom margin: 16px

2. **Page Title**
   - Text: "Browse All Books"
   - Style: 24px bold
   - Bottom margin: 16px

3. **Search Bar**
   - Same as Home screen
   - Bottom margin: 16px

4. **Filter/Sort Row** (conditional)
   - **If searching**: Shows "Results for 'query'" with "Clear" button on right
   - **If not searching**: Dropdown select for sorting
     - Options: "Recently Reviewed", "Most Reviews", "Alphabetical"
     - Style: secondary background, rounded, padding 12px
   - Bottom margin: 16px

5. **Book List**
   - Vertical stack of BookCard components
   - Gap: 12px between cards

### BookCard Component
```
┌─────────────────────────────────────────────┐
│ ┌──────┐  Title (truncated if long)         │
│ │Cover │  by Author (truncated)             │
│ │64x96 │                                    │
│ │      │  5 reviews  👍                     │
│ └──────┘  [Fiction] [Classic]               │
└─────────────────────────────────────────────┘
```
- Background: secondary color
- Border radius: 8px
- Padding: 12px
- Entire card is clickable (link to book detail)
- Cover: 64x96px, rounded corners, placeholder "No cover" if missing
- Title: semibold, truncated
- Author: hint color, truncated
- Review count + dominant sentiment badge
- Genre tags: up to 2, small pills with hint text on background color

---

## Screen 3: Book Detail

**Route**: `/book/:id`

### Layout Structure

1. **Back Link**
   - Text: "← Back to catalog"
   - Bottom margin: 16px

2. **Book Header**
   - Horizontal flex layout
   - Bottom margin: 24px
   ```
   ┌──────────────────────────────────────────┐
   │ ┌────────┐  Title (20px bold)            │
   │ │ Cover  │  by Author (hint)             │
   │ │ 96x144 │  2020 (hint, small)           │
   │ │        │  320 pages (hint, small)      │
   │ └────────┘                               │
   └──────────────────────────────────────────┘
   ```
   - Cover: 96x144px, rounded, with "No cover" placeholder if missing

3. **Genre Tags** (if present)
   - Horizontal flex wrap
   - Small rounded pills (12px font)
   - Secondary background, hint text
   - Bottom margin: 16px

4. **Description Section** (if present)
   - Section title: "Description" (semibold)
   - Body text: hint color, preserves line breaks
   - Bottom margin: 24px

5. **Goodreads Link** (if present)
   - Text: "View on Goodreads →"
   - Style: link color
   - Opens in new tab
   - Bottom margin: 24px

6. **Reviews Section**
   - Section title: "Reviews (N)" where N is total count
   - Bottom margin: 8px

7. **Sentiment Filter Buttons**
   - Horizontal flex wrap, gap 8px
   - Four pill buttons:
     - "All (N)" - shows total
     - "👍 (N)" - positive count
     - "👎 (N)" - negative count
     - "😐 (N)" - neutral count
   - Active state: primary button colors
   - Inactive state: secondary background, hint text
   - Bottom margin: 12px

8. **Review List**
   - Vertical stack of ReviewCard components
   - Gap: 12px
   - Empty state: "No reviews found" centered hint text

### ReviewCard Component (without book info)
```
┌─────────────────────────────────────────────┐
│ [Reviewer Name]           [👍] [Jan 5, 2026]│
│                                             │
│ Full review text with preserved             │
│ line breaks and formatting...               │
└─────────────────────────────────────────────┘
```
- Background: secondary color
- Border radius: 8px
- Padding: 16px
- Header row: reviewer name (link), sentiment badge, date (hint)
- Review text: regular size, preserves whitespace

---

## Screen 4: Reviewer Profile

**Route**: `/reviewer/:userId`

### Layout Structure

1. **Back Link**
   - Text: "← Back to catalog"
   - Bottom margin: 16px

2. **Reviewer Header**
   - Display name: 24px bold
   - Username (if exists): "@username" in hint color
   - Bottom margin: 24px

3. **Stats Grid**
   - 2-column grid, gap 16px
   - Bottom margin: 24px
   ```
   ┌─────────────────┬─────────────────┐
   │      42         │  👍  👎  😐     │
   │  Total Reviews  │  25   8   9     │
   └─────────────────┴─────────────────┘
   ```
   - Left card: large number (24px bold), label below
   - Right card: three emoji with counts below each
   - Both cards: secondary background, centered content, 16px padding

4. **Review History Section**
   - Section title: "Review History" (semibold)
   - Bottom margin: 12px

5. **Review List**
   - Vertical stack of ReviewCard components (with book info shown)
   - Gap: 12px
   - Empty state: "No reviews yet"

### ReviewCard Component (with book info)
```
┌─────────────────────────────────────────────┐
│ [Reviewer Name]           [👍] [Jan 5, 2026]│
│                                             │
│ [Cover]  Book Title by Author               │
│  32x48                                      │
│                                             │
│ Full review text...                         │
└─────────────────────────────────────────────┘
```
- Same as basic ReviewCard, but includes book thumbnail row
- Cover: 32x48px, title in link color, author in hint

---

## Screen 5: Top Books Leaderboard

**Route**: `/top-books`

### Layout Structure

1. **Back Link**
   - Text: "← Back to home"
   - Bottom margin: 16px

2. **Page Title**
   - Text: "Top Books"
   - Style: 24px bold
   - Bottom margin: 16px

3. **Tab Buttons**
   - Horizontal flex, gap 8px
   - Three pill buttons: "This Month", "This Year", "Overall"
   - Active: primary button colors
   - Inactive: secondary background, hint text
   - Bottom margin: 24px

4. **Leaderboard List**
   - Vertical stack of leaderboard entries
   - Gap: 8px

### Leaderboard Entry (Book)
```
┌─────────────────────────────────────────────┐
│ 🥇  [Cover]  Title                 5 reviews│
│      40x56   by Author                      │
└─────────────────────────────────────────────┘
```
- Background: secondary color
- Border radius: 8px
- Padding: 12px
- Entire row is clickable
- Rank column: 32px wide, centered
  - Top 3: 🥇 🥈 🥉 medals
  - Others: "4." "5." etc.
- Cover: 40x56px
- Title: medium weight, truncated
- Author: hint color, truncated
- Review count: hint color, right-aligned

---

## Screen 6: Top Reviewers Leaderboard

**Route**: `/top-reviewers`

### Layout Structure

1. **Back Link**
   - Text: "← Back to home"
   - Bottom margin: 16px

2. **Page Title**
   - Text: "Top Reviewers"
   - Style: 24px bold
   - Bottom margin: 16px

3. **Tab Buttons**
   - Same as Top Books screen
   - Bottom margin: 24px

4. **Leaderboard List**
   - Vertical stack of entries
   - Gap: 8px

### Leaderboard Entry (Reviewer)
```
┌─────────────────────────────────────────────┐
│ 🥇  Display Name                   12 reviews│
└─────────────────────────────────────────────┘
```
- Background: secondary color
- Border radius: 8px
- Padding: 12px
- Entire row is clickable (links to reviewer profile)
- Rank column: 32px wide, medal or number
- Name: medium weight
- Review count: hint color, right-aligned

---

## Screen 7: Fresh Reviews

**Route**: `/fresh-reviews`

### Layout Structure

1. **Back Link**
   - Text: "← Back to home"
   - Bottom margin: 16px

2. **Page Title**
   - Text: "Fresh Reviews"
   - Style: 24px bold
   - Bottom margin: 16px

3. **Review List**
   - Vertical stack of ReviewCard components (with book info)
   - Gap: 12px
   - Bottom margin: 24px

4. **Pagination Controls**
   - Horizontal flex, space-between alignment
   ```
   ┌─────────────────────────────────────────────┐
   │ [Previous]        Page 1           [Next]   │
   └─────────────────────────────────────────────┘
   ```
   - Previous/Next buttons:
     - Enabled: primary button colors
     - Disabled: secondary background, hint text, not clickable
   - Page number: centered, hint color

---

## Shared Components

### Loading State
- Centered spinner
- 32x32px
- Border animation (circular spinner)
- Uses button color

### Error State
- Centered error message
- Red text color
- Simple text display

### Empty States
- Centered hint text
- Padding: 32px vertical
- Examples: "No books found", "No reviews yet", "No reviews found"

---

## Responsive Behavior

- **Mobile-first design** optimized for Telegram Mini App viewport
- All layouts are single-column on mobile
- Horizontal scroll for review carousel on home
- Cards and inputs are full-width
- Touch-friendly tap targets (minimum 44px)
- Smooth transitions on hover/tap states (opacity: 0.8)

---

## Navigation Flow

```
                    ┌─────────────┐
                    │    Home     │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ Top Books  │  │    Top     │  │   Fresh    │
    │            │  │ Reviewers  │  │  Reviews   │
    └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐         │
    │Book Detail │◄─┤  Reviewer  │◄────────┘
    │            │  │  Profile   │
    └──────┬─────┘  └────────────┘
           │
           ▼
    ┌────────────┐
    │Browse Books│
    └────────────┘
```

All detail pages link back to Home. Book and Reviewer screens are interconnected through review cards.
