export const translations = {
  common: {
    back: "Назад",
    search: "Поиск",
    loading: "Загрузка...",
    clear: "Очистить",
    previous: "Предыдущая",
    next: "Следующая",
    page: "Страница",
    noCover: "Нет обложки",
    by: "автор",
    readMore: "Читать далее →",
    anonymous: "Аноним",
  },

  home: {
    title: "Вастрик.Книги",
    searchPlaceholder: "Поиск книг...",
    statistics: {
      text: "У нас {{booksCount}} книг, {{reviewsCount}} рецензий и {{reviewersCount}} рецензентов",
    },
    sections: {
      recentReviews: "Последние рецензии",
    },
    navigation: {
      topBooks: "📚 Топ книг",
      topReviewers: "🏆 Топ рецензентов",
      freshReviews: "⭐ Свежие рецензии",
      browseAllBooks: "📖 Все книги",
    },
    noReviews: "Рецензий пока нет",
  },

  book: {
    pages: "{{count}} стр.",
    description: "Описание",
    viewOnGoodreads: "Посмотреть на Goodreads →",
    reviews: "Рецензии",
    reviewsCount: "Рецензии ({{count}})",
    filters: {
      all: "Все ({{count}})",
    },
    notFound: "Книга не найдена",
    noReviews: "Рецензий не найдено",
  },

  reviewer: {
    totalReviews: "Всего рецензий",
    reviewHistory: "История рецензий",
    noReviews: "Рецензий пока нет",
    notFound: "Рецензент не найден",
  },

  leaderboard: {
    topBooks: "Топ книг",
    tabs: {
      overall: "За всё время",
      last30days: "30 дней",
      last365days: "365 дней",
    },
    noBooks: "Книг пока нет",
  },

  reviewersLeaderboard: {
    topReviewers: "Топ рецензентов",
    tabs: {
      overall: "За всё время",
      last30days: "30 дней",
      last365days: "365 дней",
    },
    noReviews: "Рецензий пока нет",
  },

  freshReviews: {
    title: "Свежие рецензии",
    noReviews: "Рецензий пока нет",
  },

  browseBooks: {
    title: "Все книги",
    resultsFor: 'Результаты для "{{query}}"',
    sortBy: {
      recentlyReviewed: "Недавно прорецензированные",
      alphabetical: "По алфавиту",
    },
    noBooks: "Книг не найдено",
  },

  errors: {
    loadData: "Не удалось загрузить данные",
    loadBook: "Не удалось загрузить книгу",
    loadReviewer: "Не удалось загрузить рецензента",
    loadLeaderboard: "Не удалось загрузить рейтинг",
    loadReviews: "Не удалось загрузить рецензии",
    loadBooks: "Не удалось загрузить книги",
  },

  plurals: {
    reviews: {
      one: "{{count}} рецензия",
      few: "{{count}} рецензии",
      many: "{{count}} рецензий",
    },
    books: {
      one: "{{count}} книга",
      few: "{{count}} книги",
      many: "{{count}} книг",
    },
  },
};

export type Translations = typeof translations;
