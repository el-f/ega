/** Native CLI table: UI radios and schema read it; a new CLI also needs a host-side runner. */
export interface NativeCliEntry {
  /** Wire id sent to the native host as the `backend` field. */
  id: string;
  /** Short human label for the radio button (e.g. "Claude Code"). */
  label: string;
  /** Optional one-line hint shown under the model field when this CLI is selected (e.g. "Uses the configured Codex profile."). */
  modelDiscoveryHint?: string;
}

export const NATIVE_CLI_REGISTRY: ReadonlyArray<NativeCliEntry> = [
  {
    id: 'claude',
    label: 'Claude Code',
    modelDiscoveryHint: 'Defaults to the active Claude Code login.',
  },
  {
    id: 'codex',
    label: 'Codex',
    modelDiscoveryHint: 'Uses the configured Codex profile.',
  },
];

export type NativeCliId = string;

export const DEFAULT_NATIVE_CLI: NativeCliId = 'claude';

export function isKnownNativeCli(v: unknown): v is NativeCliId {
  return typeof v === 'string' && NATIVE_CLI_REGISTRY.some((e) => e.id === v);
}
