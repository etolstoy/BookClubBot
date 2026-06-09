import { createLLMClient } from "../clients/llm/factory.js";
import type { ILLMClient } from "../lib/interfaces/index.js";

function coversOriginalWithWhitespaceSeparators(
  originalText: string,
  parts: string[]
): boolean {
  let searchFrom = 0;

  for (const part of parts) {
    const partIndex = originalText.indexOf(part, searchFrom);
    if (partIndex === -1) {
      return false;
    }

    if (searchFrom > 0 && originalText.slice(searchFrom, partIndex).trim().length > 0) {
      return false;
    }

    searchFrom = partIndex + part.length;
  }

  return originalText.slice(searchFrom).trim().length === 0;
}

function fallbackToSingle(reviewText: string): string[] {
  return [reviewText];
}

function reconstructPartsFromStartMarkers(
  originalText: string,
  markers: string[] | undefined
): string[] | null {
  if (!markers || markers.length < 2 || markers.some((marker) => marker.trim().length === 0)) {
    return null;
  }

  const starts: number[] = [];
  let searchFrom = 0;

  for (const marker of markers) {
    const index = originalText.indexOf(marker, searchFrom);
    if (index === -1) {
      return null;
    }

    starts.push(index);
    searchFrom = index + marker.length;
  }

  const parts = starts.map((start, index) => {
    const end = starts[index + 1] ?? originalText.length;
    return originalText.slice(start, end).trimEnd();
  });

  if (parts.some((part) => part.trim().length === 0)) {
    return null;
  }

  return parts;
}

/**
 * Split one Telegram review message into independently processable review texts.
 * Fails open as a single review unless the classifier returns multiple exact,
 * ordered substrings copied from the original message.
 */
export async function splitReviewText(
  reviewText: string,
  llmClient?: ILLMClient
): Promise<string[]> {
  const client = llmClient || createLLMClient();

  try {
    const classification = await client.classifyReviewStructure(reviewText);

    if (!classification || classification.kind !== "concatenated") {
      return fallbackToSingle(reviewText);
    }

    const parts = classification.parts;
    if (parts.length >= 2 && !parts.some((part) => part.trim().length === 0)) {
      if (coversOriginalWithWhitespaceSeparators(reviewText, parts)) {
        return parts;
      }
    }

    const reconstructedParts = reconstructPartsFromStartMarkers(
      reviewText,
      classification.partStartMarkers
    );
    if (reconstructedParts) {
      return reconstructedParts;
    }

    if (classification.kind === "concatenated") {
      console.warn("[Review Splitting] Invalid split response, using original text");
    }

    return fallbackToSingle(reviewText);
  } catch (error) {
    console.error("[Review Splitting] Error splitting review text:", error);
    return fallbackToSingle(reviewText);
  }
}
