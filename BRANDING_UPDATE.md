# Branding Update: Вастрик.Книги

All branding has been updated from "Книжный клуб" (Book Club) to **"Вастрик.Книги"** with the vas3k.club logo.

## Changes Made

### 1. Title and Branding
- **New name**: Вастрик.Книги
- **Logo**: vas3k.club logo placed between "Вастрик" and "Книги"
- **Logo source**: https://github.com/vas3k/vas3k.club/blob/master/frontend/static/images/logo/logo-1024.png
- **Logo location**: `mini-app/public/logo.png`

### 2. Typography
- **Font**: Ubuntu (from Google Fonts)
- **Weights**: 300, 400, 500, 700
- **Applied**: Throughout the entire application via Tailwind CSS

### 3. Files Modified

#### HTML
- `mini-app/index.html`
  - Added Ubuntu font from Google Fonts
  - Changed page title to "Вастрик.Книги"
  - Changed language to "ru"

#### Translations
- `mini-app/src/i18n/translations.ts`
  - Updated `home.title` from "Книжный клуб" to "Вастрик.Книги"

#### Styling
- `mini-app/tailwind.config.js`
  - Added Ubuntu as default sans-serif font family

#### Components
- `mini-app/src/pages/Home.tsx`
  - Updated title display to show logo + "Вастрик.Книги" aligned to left

#### Favicon
- `mini-app/public/favicon-16x16.png` - Created 16x16 favicon
- `mini-app/public/favicon-32x32.png` - Created 32x32 favicon
- `mini-app/public/logo.png` - Used for Apple touch icon

## Visual Structure

```
┌─────────────────────────────┐
│ 🖼️  Вастрик.Книги           │ ← Logo on left
│   [Search Bar]              │
│   Statistics                │
│   Recent Reviews            │
│   Navigation Buttons        │
└─────────────────────────────┘
```

## Favicon

The logo is also used as the favicon in multiple sizes:
- `favicon-16x16.png` - 16x16 pixels
- `favicon-32x32.png` - 32x32 pixels
- `logo.png` - 1024x1024 pixels (for Apple touch icon)

## Font Stack

```css
font-family: 'Ubuntu', system-ui, -apple-system, sans-serif;
```

All text throughout the application now uses the Ubuntu font family for consistent branding with vas3k.club.

## Testing

1. Start the mini-app:
   ```bash
   cd mini-app
   npm run dev
   ```

2. Verify:
   - Title displays logo + "Вастрик.Книги" on the left
   - Logo is visible and properly sized (32x32)
   - Favicon appears in browser tab
   - Ubuntu font is used throughout
   - All text is in Russian

## Notes

- Logo is served from `public/logo.png` (auto-served by Vite at `/logo.png`)
- Font is loaded from Google Fonts CDN
- All UI remains fully in Russian (previous localization work)
