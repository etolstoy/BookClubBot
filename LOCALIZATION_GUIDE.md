# Russian Localization Guide

All UI texts from the mini-app have been extracted to a separate file for easy maintenance and translation updates.

## What's Been Created

### Files

**Location:** `mini-app/src/i18n/`

- **`translations.ts`** - All Russian UI texts in one place
- **`index.ts`** - i18n utilities and React hooks
- **`README.md`** - Detailed documentation

### Features

✅ **Type-safe translations** - TypeScript ensures correctness
✅ **Variable interpolation** - Support for dynamic values like `{{count}}`
✅ **Proper Russian plurals** - Handles 3 forms (1 книга, 2 книги, 5 книг)
✅ **No dependencies** - Custom lightweight implementation
✅ **Centralized** - All texts in one file for easy updates

## Quick Start

### Using Translations in Components

```tsx
import { useTranslation } from "../i18n";

export default function MyComponent() {
  const { t, plural } = useTranslation();

  return (
    <div>
      <h1>{t("home.title")}</h1>
      <button>{t("common.back")}</button>
      <span>{plural("plurals.reviews", count)}</span>
    </div>
  );
}
```

### Example Component

See `mini-app/src/pages/Home.example.tsx` for a complete example of converting a component to use translations.

## Russian Plural Forms

The system automatically handles Russian plural forms:

| Count | Form | Example |
|-------|------|---------|
| 1, 21, 31... | one | 1 рецензия |
| 2-4, 22-24... | few | 2 рецензии |
| 0, 5-20, 25-30... | many | 5 рецензий |

Usage:
```tsx
const { plural } = useTranslation();

// Automatically displays correct form
plural("plurals.reviews", 1);   // "1 рецензия"
plural("plurals.reviews", 2);   // "2 рецензии"
plural("plurals.reviews", 5);   // "5 рецензий"
plural("plurals.reviews", 21);  // "21 рецензия"
```

## Translation Coverage

All UI texts have been extracted:

### Pages
- ✅ Home (Book Club homepage)
- ✅ Book Detail
- ✅ Reviewer Profile
- ✅ Top Books Leaderboard
- ✅ Top Reviewers Leaderboard
- ✅ Fresh Reviews
- ✅ Browse All Books

### Components
- ✅ Navigation buttons
- ✅ Search bar
- ✅ Error messages
- ✅ Loading states
- ✅ Pagination
- ✅ Filters
- ✅ Statistics

### Special Features
- ✅ Dates (handled by browser's `toLocaleDateString`)
- ✅ Review counts with correct plurals
- ✅ Book counts with correct plurals

## Migration Steps

### Step 1: Update Each Component

Replace hardcoded strings with translation keys:

**Before:**
```tsx
<h1>Book Club</h1>
<button>Back</button>
<span>{count} review{count !== 1 ? "s" : ""}</span>
```

**After:**
```tsx
const { t, plural } = useTranslation();

<h1>{t("home.title")}</h1>
<button>{t("common.back")}</button>
<span>{plural("plurals.reviews", count)}</span>
```

### Step 2: Test Each Page

1. Check that all text displays correctly in Russian
2. Verify plurals work (test with counts: 1, 2, 5, 21, 22, 25)
3. Check variables are interpolated correctly

## Translation Keys Reference

### Common (Shared)
```typescript
t("common.back")           // "Назад"
t("common.search")         // "Поиск"
t("common.loading")        // "Загрузка..."
t("common.noCover")        // "Нет обложки"
t("common.by")             // "автор"
t("common.readMore")       // "Читать далее →"
```

### Home Page
```typescript
t("home.title")                     // "Книжный клуб"
t("home.searchPlaceholder")         // "Поиск книг..."
t("home.sections.recentReviews")    // "Последние рецензии"
t("home.navigation.topBooks")       // "📚 Топ книг"
t("home.noReviews")                 // "Рецензий пока нет"
```

### With Variables
```typescript
t("home.statistics.text", {
  booksCount: 42,
  reviewsCount: 150,
  reviewersCount: 25
})
// "У нас 42 книг, 150 рецензий и 25 рецензентов"
```

### Plurals
```typescript
plural("plurals.reviews", count)   // Automatic plural form
plural("plurals.books", count)     // Automatic plural form
```

### Errors
```typescript
t("errors.loadData")              // "Не удалось загрузить данные"
t("errors.loadBook")              // "Не удалось загрузить книгу"
```

## Adding New Translations

1. Add to `mini-app/src/i18n/translations.ts`:
```typescript
export const translations = {
  // ... existing
  newFeature: {
    title: "Новая функция",
    subtitle: "С {{count}} элементами"
  }
};
```

2. Use in component:
```tsx
const { t } = useTranslation();
t("newFeature.title");
t("newFeature.subtitle", { count: 5 });
```

## File Structure

```
mini-app/src/i18n/
├── index.ts                      # i18n system & hooks
├── translations.ts               # All Russian texts
└── README.md                     # Detailed docs

mini-app/src/pages/
└── Home.example.tsx             # Example converted component

LOCALIZATION_GUIDE.md            # This file
```

## Updating Translations

To update any UI text, simply edit `mini-app/src/i18n/translations.ts`:

```typescript
export const translations = {
  home: {
    title: "Книжный клуб", // Change this to update the home title
    // ...
  },
  // ...
};
```

No code changes needed in components - they automatically use the updated text!

## Notes

- **All translations are in Russian**
- TypeScript ensures translation keys are correct
- No external libraries needed
- Lightweight (~70 lines of code)
- Easy to maintain - all texts in one file

## Next Steps

1. Review the Russian translations in `mini-app/src/i18n/translations.ts`
2. Update components one by one using `Home.example.tsx` as reference
3. Test thoroughly with different counts for plural forms

For detailed examples and API documentation, see:
- `mini-app/src/i18n/README.md`
- `mini-app/src/pages/Home.example.tsx`
