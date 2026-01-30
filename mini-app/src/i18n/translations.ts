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
    saving: "Сохранение...",
    save: "Сохранить",
    cancel: "Отмена",
    reviews: "рецензий",
    books: "книг",
    linkCopied: "Ссылка скопирована",
    copyLink: "Скопировать ссылку",
  },

  home: {
    title: "Вастрик.Книги",
    searchPlaceholder: "Поиск книг...",
    statistics: {
      text: "У нас {{booksCount}} книг, {{reviewsCount}} рецензий и {{reviewersCount}} клубней",
    },
    sections: {
      recentReviews: "Последние рецензии",
    },
    navigation: {
      topBooks: "Топ книг",
      topReviewers: "Топ клубней",
      topAuthors: "Топ писателей",
      freshReviews: "Свежие рецензии",
      browseAllBooks: "Все книги",
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

  review: {
    edit: "Редактировать",
    notFound: "Рецензия не найдена",
  },

  reviewer: {
    totalReviews: "Всего рецензий",
    reviewHistory: "История рецензий",
    noReviews: "Рецензий пока нет",
    noReviewsOwn: "Ты еще не написал ни одной рецензии! Закидывай их в чат и помечай тегом #рецензия",
    notFound: "Клубень не найден",
  },

  leaderboard: {
    topBooks: "Топ книг",
    tabs: {
      overall: "За всё время",
      last30days: "За 30 дней",
      last365days: "За 365 дней",
    },
    noBooks: "Книг пока нет",
  },

  reviewersLeaderboard: {
    topReviewers: "Топ клубней",
    tabs: {
      overall: "За всё время",
      last30days: "За 30 дней",
      last365days: "За 365 дней",
    },
    noReviews: "Рецензий пока нет",
  },

  freshReviews: {
    title: "Свежие рецензии",
    noReviews: "Рецензий пока нет",
  },

  popularAuthors: {
    title: "Топ писателей",
    noAuthors: "Писателей пока нет",
  },

  authorBooks: {
    noBooks: "Книг не найдено",
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
    loadReviewer: "Не удалось загрузить клубня",
    loadLeaderboard: "Не удалось загрузить рейтинг",
    loadReviews: "Не удалось загрузить рецензии",
    loadBooks: "Не удалось загрузить книги",
    loadAuthors: "Не удалось загрузить писателей",
    loadAuthorBooks: "Не удалось загрузить книги автора",
    invalidAuthor: "Неверное имя автора",
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
    reviewers: {
      one: "{{count}} клубень",
      few: "{{count}} клубня",
      many: "{{count}} клубней",
    },
  },

  editReview: {
    title: "Редактировать рецензию",
    reviewText: "Текст рецензии",
    reviewTextPlaceholder: "Напишите вашу рецензию...",
    sentiment: "Настроение",
    book: "Книга",
    changeBook: "Изменить",
    selectBook: "Выбрать книгу",
    searchBookPlaceholder: "Поиск по названию или автору...",
    searchingDatabase: "Поиск в базе...",
    searchingGoogleBooks: "Поиск в Google Books...",
    searchGoogleBooks: "Искать в Google Books",
    createNewBook: "Создать новую книгу",
    databaseResults: "Книги из нашей базы:",
    googleBooksResults: "Книги из Google Books:",
    inOurDatabase: "В нашей базе",
    fromGoogleBooks: "Из Google Books",
    noBookResults: "Книги не найдены",
    noGoogleBooksResults: "Google Books не нашёл книг",
    errors: {
      emptyText: "Текст рецензии не может быть пустым",
      saveFailed: "Не удалось сохранить изменения",
      googleBooksSearchFailed: "Не удалось выполнить поиск в Google Books",
    },
  },

  sentiment: {
    positive: "Положительное",
    negative: "Отрицательное",
    neutral: "Нейтральное",
  },
};

export type Translations = typeof translations;
