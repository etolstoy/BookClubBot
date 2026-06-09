import { describe, expect, it } from "vitest";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { splitReviewText } from "../../src/services/review-splitting.service.js";
import { loadReviewFixture } from "../fixtures/helpers/fixture-loader.js";

describe("Review Splitting Service", () => {
  it("returns clear concatenated review parts", async () => {
    const parts = [
      "BOOK 1\nLoved The Great Gatsby.",
      "BOOK 2\n1984 was bleak and excellent.",
      "BOOK 3\nWar and Peace took forever but paid off. #рецензия",
    ];
    const reviewText = parts.join("\n\n");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual(parts);
  });

  it("keeps comparative multi-book reviews as one original text", async () => {
    const fixture = loadReviewFixture("multiple-books");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(fixture.reviewText, {
      reviewStructure: {
        kind: "single",
        parts: [fixture.reviewText],
      },
    });

    await expect(splitReviewText(fixture.reviewText, mockClient)).resolves.toEqual([
      fixture.reviewText,
    ]);
  });

  it("accepts repeated standalone author-title-rating headings after an intro", async () => {
    const intro = "Краткие сводки о прочитанном недавно, часть 2";
    const parts = [
      [
        "Паринуш Сание — Книга судьбы 4/5",
        "",
        "Иранская семейная сага, где у героини вроде бы есть жизнь и мнения, но решает всегда кто-то другой.",
      ].join("\n"),
      [
        "Стивен Уитт — The Thinking Machine: Jensen Huang, Nvidia, and the World's Most Coveted Microchip 3/5",
        "",
        "Книга про Дженсена Хуанга, Nvidia и чипы, вокруг которых сосредоточены интересы власть имущих.",
      ].join("\n"),
      [
        "Клэр Киган — So Late in the Day 4/5",
        "",
        "Клэр Киган написала маленькую вещь, в которой как будто почти ничего не происходит. #рецензия",
      ].join("\n"),
    ];
    const reviewText = [intro, ...parts].join("\n\n");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual(parts);
  });

  it("accepts title-only, author-title, and author-title-extra headings", async () => {
    const parts = [
      [
        "The Great Gatsby",
        "",
        "Loved the prose and the sad little party atmosphere.",
      ].join("\n"),
      [
        "George Orwell — 1984",
        "",
        "Bleak, sharp, and still useful as political vocabulary.",
      ].join("\n"),
      [
        "Лев Толстой — Война и мир 5/5",
        "",
        "Большая, медленная и очень живая книга. #рецензия",
      ].join("\n"),
    ];
    const reviewText = parts.join("\n\n");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual(parts);
  });

  it("reconstructs exact parts from start markers", async () => {
    const parts = [
      [
        "The Great Gatsby",
        "",
        "Loved the prose and the sad little party atmosphere.",
      ].join("\n"),
      [
        "George Orwell — 1984",
        "",
        "Bleak, sharp, and still useful as political vocabulary.",
      ].join("\n"),
      [
        "Лев Толстой — Война и мир 5/5",
        "",
        "Большая, медленная и очень живая книга. #рецензия",
      ].join("\n"),
    ];
    const reviewText = ["Recent reads", ...parts].join("\n\n");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts: [],
        partStartMarkers: [
          "The Great Gatsby",
          "George Orwell — 1984",
          "Лев Толстой — Война и мир 5/5",
        ],
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual(parts);
  });

  it("accepts repeated title-author headings", async () => {
    const parts = [
      [
        "The Great Gatsby — F. Scott Fitzgerald",
        "",
        "Loved the prose and the sad little party atmosphere.",
      ].join("\n"),
      [
        "1984 — George Orwell",
        "",
        "Bleak, sharp, and still useful as political vocabulary. #рецензия",
      ].join("\n"),
    ];
    const reviewText = parts.join("\n\n");
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual(parts);
  });

  it("falls back when parts are rewritten instead of exact substrings", async () => {
    const reviewText = "BOOK 1\nLoved Gatsby.\n\nBOOK 2\nLoved 1984. #рецензия";
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts: ["Loved Gatsby.", "Loved Orwell."],
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual([
      reviewText,
    ]);
  });

  it("falls back when exact substrings do not cover the original message", async () => {
    const reviewText = "BOOK 1\nLoved Gatsby.\n\nBOOK 2\nLoved 1984. #рецензия";
    const mockClient = new MockLLMClient();
    mockClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts: ["Loved Gatsby.", "Loved 1984. #рецензия"],
      },
    });

    await expect(splitReviewText(reviewText, mockClient)).resolves.toEqual([
      reviewText,
    ]);
  });

  it("falls back when classifier returns null or throws", async () => {
    const reviewText = "BOOK 1\nLoved Gatsby.\n\nBOOK 2\nLoved 1984. #рецензия";
    const nullClient = new MockLLMClient();
    nullClient.mockResponse(reviewText, {
      reviewStructure: null,
    });

    await expect(splitReviewText(reviewText, nullClient)).resolves.toEqual([
      reviewText,
    ]);

    const throwingClient = new MockLLMClient();
    throwingClient.mockResponse(reviewText, {
      shouldThrow: true,
      error: new Error("classifier failed"),
    });

    await expect(splitReviewText(reviewText, throwingClient)).resolves.toEqual([
      reviewText,
    ]);
  });
});
