import { translations } from "./translations.js";

// Simple i18n helper
class I18n {
  // Get nested translation value by path
  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  // Replace variables in translation string
  private interpolate(text: string, vars?: Record<string, any>): string {
    if (!vars) return text;

    return Object.entries(vars).reduce((result, [key, value]) => {
      return result.replace(new RegExp(`{{${key}}}`, "g"), String(value));
    }, text);
  }

  t(key: string, vars?: Record<string, any>): string {
    const translation = this.getNestedValue(translations, key);

    if (translation === undefined) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }

    return this.interpolate(translation, vars);
  }

  // Plural helper for Russian language
  // Russian has 3 plural forms: one, few, many
  // Examples: 1 книга, 2 книги, 5 книг
  plural(key: string, count: number): string {
    const pluralForm = this.getRussianPluralForm(count);
    const translation = this.getNestedValue(translations, `${key}.${pluralForm}`);

    if (translation === undefined) {
      console.warn(`Plural translation missing for key: ${key}.${pluralForm}`);
      return key;
    }

    return this.interpolate(translation, { count });
  }

  private getRussianPluralForm(count: number): "one" | "few" | "many" {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return "one"; // 1, 21, 31, 41... (рецензия)
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return "few"; // 2-4, 22-24, 32-34... (рецензии)
    }

    return "many"; // 0, 5-20, 25-30... (рецензий)
  }
}

export const i18n = new I18n();

// Hook for React components
export function useTranslation() {
  return {
    t: (key: string, vars?: Record<string, any>) => i18n.t(key, vars),
    plural: (key: string, count: number) => i18n.plural(key, count),
  };
}
