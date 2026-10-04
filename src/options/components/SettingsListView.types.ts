/** Own .ts file because the *.svelte shim does not expose module-script exports to tsc. */
export interface SettingsListItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly tab: string;
  readonly tabLabel?: string;
  readonly modified?: boolean;
  /** Optional highlight needle from the parent's filter input. */
  readonly highlightQuery?: string;
}
