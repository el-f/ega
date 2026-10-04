/** Native CLI table: UI radios and schema read it; a new CLI also needs a host-side runner. */
export interface NativeCliEntry {
  /** Wire id sent to the native host as the `backend` field. */
  id: string;
  /** Short human label for the radio button (e.g. "Claude Code"). */
  label: string;
  /** Optional one-line hint shown under the model field when this CLI is selected. */
  modelDiscoveryHint?: string;
  /** An id this CLI accepts; an alias where there is one, so it never goes stale. */
  modelPlaceholder: string;
  /** What the user runs in a terminal to log in. */
  loginCommand: string;
}

export const NATIVE_CLI_REGISTRY: ReadonlyArray<NativeCliEntry> = [
  {
    id: 'claude',
    label: 'Claude Code',
    modelDiscoveryHint: 'Blank uses the Claude Code default for your plan.',
    modelPlaceholder: 'e.g. sonnet',
    loginCommand: 'claude',
  },
  {
    id: 'codex',
    label: 'Codex',
    modelDiscoveryHint: "Blank uses the Codex default: Ega's requests skip your config.toml.",
    modelPlaceholder: 'e.g. gpt-6-luna',
    loginCommand: 'codex login',
  },
];

export type NativeCliId = string;

export const DEFAULT_NATIVE_CLI: NativeCliId = 'claude';

export function isKnownNativeCli(v: unknown): v is NativeCliId {
  return typeof v === 'string' && NATIVE_CLI_REGISTRY.some((e) => e.id === v);
}
