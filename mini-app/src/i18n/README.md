# Russian Localization

All UI texts have been extracted to a separate file for easy maintenance and updates. The mini-app uses Russian as the default language.

## File Structure

```
mini-app/src/i18n/
├── index.ts           # i18n utilities and hooks
├── translations.ts    # Russian translations
└── README.md          # This file
```

## Usage in Components

### Basic Translation

```tsx
import { useTranslation } from "../i18n";

export default function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t("home.title")}</h1>
      <button>{t("common.back")}</button>
    </div>
  );
}
```

### Translation with Variables

```tsx
const { t } = useTranslation();

// Translation key: "home.statistics.text"
// Translation: "У нас {{booksCount}} книг, {{reviewsCount}} рецензий и {{reviewersCount}} рецензентов"
const text = t("home.statistics.text", {
  booksCount: 42,
  reviewsCount: 150,
  reviewersCount: 25
});
```

### Plurals (Russian Forms)

The `plural()` function automatically handles Russian plural forms:

```tsx
const { plural } = useTranslation();

// Automatically selects correct Russian form:
// 1 рецензия, 2 рецензии, 5 рецензий, 21 рецензия, 22 рецензии...
const reviewText = plural("plurals.reviews", reviewCount);
const bookText = plural("plurals.books", bookCount);
```

### Russian Plural Rules

Russian has 3 plural forms that are automatically selected:

| Count | Form | Example |
|-------|------|---------|
| 1, 21, 31, 41... | one | 1 рецензия |
| 2-4, 22-24, 32-34... | few | 2 рецензии |
| 0, 5-20, 25-30... | many | 5 рецензий |

## Example: Converting a Component

**Before:**
```tsx
export default function BookCard({ book }) {
  return (
    <div>
      <h3>{book.title}</h3>
      <p>by {book.author}</p>
      <span>{book.reviewCount} review{book.reviewCount !== 1 ? "s" : ""}</span>
    </div>
  );
}
```

**After:**
```tsx
import { useTranslation } from "../i18n";

export default function BookCard({ book }) {
  const { t, plural } = useTranslation();

  return (
    <div>
      <h3>{book.title}</h3>
      {book.author && <p>{t("common.by")} {book.author}</p>}
      <span>{plural("plurals.reviews", book.reviewCount)}</span>
    </div>
  );
}
```

## Translation Structure

Translations are organized by feature/page in `translations.ts`:

```typescript
{
  common: {          // Shared texts
    back: "Назад",
    search: "Поиск",
    // ...
  },
  home: {           // Home page
    title: "Книжный клуб",
    // ...
  },
  book: {           // Book detail page
    // ...
  },
  // ... other pages
  errors: {         // Error messages
    // ...
  },
  plurals: {        // Plural forms
    reviews: { ... },
    books: { ... },
  }
}
```

## Adding New Translations

1. Add the key to `translations.ts`:
```typescript
export const translations = {
  // ...
  myFeature: {
    title: "Моя функция",
    description: "Это {{name}}"
  }
};
```

2. Use it in your component:
```tsx
const { t } = useTranslation();
t("myFeature.title");
t("myFeature.description", { name: "пример" });
```

## TypeScript Support

The `Translations` type is exported and ensures type safety when accessing translation keys.

## Common Translation Keys

### Shared Texts
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
plural("plurals.reviews", count)   // Automatic Russian plural form
plural("plurals.books", count)     // Automatic Russian plural form
```

### Errors
```typescript
t("errors.loadData")              // "Не удалось загрузить данные"
t("errors.loadBook")              // "Не удалось загрузить книгу"
```

## Notes

- All translations use Russian by default
- The system is type-safe with TypeScript
- Missing translations log a warning and return the key
- Uses simple string interpolation with `{{variable}}` syntax
- No external dependencies (custom implementation)
- Automatically handles Russian plural forms
