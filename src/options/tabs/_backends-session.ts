// Module-level, so Backends tab state survives a tab switch; in-memory only, so a reload resets it.

interface BackendsSessionState {
  /** null = no manual choice yet; the caller falls back to its own default. */
  nhInstallOpen: boolean | null;
}

const state: BackendsSessionState = {
  nhInstallOpen: null,
};

export function getNhInstallOpen(): boolean | null {
  return state.nhInstallOpen;
}

export function setNhInstallOpen(next: boolean): void {
  state.nhInstallOpen = next;
}
