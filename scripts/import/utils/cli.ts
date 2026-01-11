import * as readline from "readline";

// ANSI color codes
export function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

export function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

export function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

export function blue(text: string): string {
  return `\x1b[34m${text}\x1b[0m`;
}

export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

export function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

// Prompt helper
export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Display helpers
export function displayProgress(current: number, total: number): string {
  const percent = Math.round((current / total) * 100);
  return `[${current}/${total}] ${percent}%`;
}

export function displayCheckmark(condition: boolean): string {
  return condition ? green("✓") : red("✗");
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function displaySeparator(): string {
  return "=".repeat(70);
}

// Confidence color coding
export function colorConfidence(confidence: string): string {
  switch (confidence) {
    case "high":
      return green(confidence);
    case "medium":
      return yellow(confidence);
    case "low":
      return red(confidence);
    default:
      return confidence;
  }
}
