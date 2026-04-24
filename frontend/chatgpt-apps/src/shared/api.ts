// Apps SDK runtime API. See docs/chatgpt-apps/apps-sdk-verified.md
// for the exact shape — update this file if that doc diverges.

import { useSyncExternalStore } from "react";

interface OpenAIGlobals {
  toolOutput?: unknown;
  toolInput?: unknown;
  theme?: "light" | "dark";
  displayMode?: "inline" | "fullscreen" | "pip";
  // Other fields exist (widgetState, locale, userAgent, maxHeight, ...) —
  // add here on demand. Keep the surface small.
}

declare global {
  interface Window {
    openai?: OpenAIGlobals;
  }
  interface WindowEventMap {
    "openai:set_globals": CustomEvent<{ globals: OpenAIGlobals }>;
  }
}

/** React hook: returns the current tool output, re-renders on host updates.
 *
 * Subscribes to the `openai:set_globals` event so widgets stay live across
 * multiple tool calls within the same conversation turn.
 */
export function useToolOutput<T>(): T | null {
  return useSyncExternalStore(
    subscribeToOpenAIGlobals,
    () => (window.openai?.toolOutput ?? null) as T | null,
    // Server snapshot (SSR): always null — widgets never SSR.
    () => null,
  );
}

function subscribeToOpenAIGlobals(onChange: () => void): () => void {
  window.addEventListener("openai:set_globals", onChange);
  return () => window.removeEventListener("openai:set_globals", onChange);
}

/** Hook variant for theme — same subscription pattern. */
export function useOpenAITheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToOpenAIGlobals,
    () => window.openai?.theme ?? "light",
    () => "light",
  );
}

/** True if the tool response is the "not_activated" sentinel shape. */
export function isNotActivated(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output != null &&
    (output as { state?: string }).state === "not_activated"
  );
}

/** True if the tool response is an error envelope ({error: "..."}). */
export function isToolError(output: unknown): output is { error: string } {
  return (
    typeof output === "object" &&
    output != null &&
    typeof (output as { error?: unknown }).error === "string"
  );
}
