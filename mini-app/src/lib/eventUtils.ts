import { MouseEvent } from "react";

/**
 * Creates a click handler that optionally stops event propagation
 * Useful when you have nested clickable elements
 */
export function stopPropagationIf(condition: boolean) {
  return condition
    ? (e: MouseEvent) => e.stopPropagation()
    : undefined;
}

/**
 * Wraps a handler to stop propagation before executing
 */
export function withStopPropagation<T extends (...args: any[]) => void>(
  handler: T,
  shouldStop: boolean = true
) {
  return (e: MouseEvent, ...args: Parameters<T>) => {
    if (shouldStop) e.stopPropagation();
    handler(e as any, ...args);
  };
}
