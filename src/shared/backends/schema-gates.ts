/** Enable a provider only after a successful live schema request. Local backends also need the saved-sample A/B. */
export const LIVE_SCHEMA_BACKENDS: ReadonlySet<string> = new Set(['gemini']);
