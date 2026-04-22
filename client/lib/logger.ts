/**
 * Logs handled/expected errors for developer visibility WITHOUT triggering
 * React Native's LogBox red error overlay (which appears at the bottom of the
 * screen in dev mode whenever console.error is called).
 *
 * Use this anywhere you catch an error and have already shown a friendly
 * message to the user via setError / Alert / banner — the user shouldn't also
 * see a raw "ApiError: ..." stack at the bottom of the screen.
 *
 * For unexpected programmer errors that should surface loudly in dev, keep
 * using console.error directly.
 */
export function logHandledError(context: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  console.log(`[handled] ${context}: ${detail}`);
}
