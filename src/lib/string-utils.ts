/**
 * Shared string utilities for text normalization and similarity comparison
 */

/**
 * Normalize a string for similarity comparison
 * Converts to lowercase, removes special characters, normalizes whitespace
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Levenshtein similarity between two strings
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 1;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  // Levenshtein distance calculation
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }

  return (longer.length - costs[s2.length]) / longer.length;
}

/**
 * Get the correct Russian plural form for "review" based on count
 *
 * Russian pluralization rules:
 * - Numbers ending in 1 (except 11): рецензия (singular)
 * - Numbers ending in 2-4 (except 12-14): рецензии (few)
 * - Numbers ending in 0, 5-9, 11-14: рецензий (many)
 *
 * @param count - Number of reviews
 * @returns Correct Russian plural form
 *
 * @example
 * getRussianPluralReview(1)   // "рецензия"
 * getRussianPluralReview(2)   // "рецензии"
 * getRussianPluralReview(5)   // "рецензий"
 * getRussianPluralReview(21)  // "рецензия"
 * getRussianPluralReview(22)  // "рецензии"
 * getRussianPluralReview(25)  // "рецензий"
 * getRussianPluralReview(111) // "рецензий"
 */
export function getRussianPluralReview(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  // Special case: numbers ending in 11-14 always use "many" form
  if (mod100 >= 11 && mod100 <= 14) {
    return "рецензий";
  }

  // Numbers ending in 1: singular
  if (mod10 === 1) {
    return "рецензия";
  }

  // Numbers ending in 2-4: few
  if (mod10 >= 2 && mod10 <= 4) {
    return "рецензии";
  }

  // All other cases: many (0, 5-9)
  return "рецензий";
}
