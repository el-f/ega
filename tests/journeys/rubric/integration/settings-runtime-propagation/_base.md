# Settings-runtime-propagation surface rubric

## Propagation contract

- Settings writes propagate to every mounted surface via the storage-change bus; surfaces re-read on the next user action without remount.
- Mid-stream writes do NOT mutate the in-flight request — the running stream finishes under its original config; the next request honors the new config.

## Storage hygiene

- `preCleanForStorage` strips retired keys on load; the user never sees a migration banner — the cleanup is invisible.
- Quota near full surfaces a warning toast on the writing surface; the audit log still appends.

## Per-site

- Per-site override writes survive tab reload (covered by sitePrefStored schema regression — the override must NOT be silently stripped).

## Theme + display

- Theme toggle propagates to every surface in one frame; data-theme attribute flips synchronously across popup / sidepanel / tooltip / options.
- Display-mode change re-renders the mounted tooltip without close+reopen.
