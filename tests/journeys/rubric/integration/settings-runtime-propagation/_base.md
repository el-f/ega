# Settings-runtime-propagation surface rubric

## Propagation contract

- Settings writes propagate to every mounted surface via the storage-change bus; surfaces re-read on the next user action without remount.
- Mid-stream writes do NOT mutate the in-flight request — the running stream finishes under its original config; the next request honors the new config.

## Storage hygiene

- `preCleanForStorage` strips retired keys on load; the user never sees a migration banner — the cleanup is invisible.
- A write that fails on storage quota is not saved; the side panel, popup and Options show a toast "Storage is full, so the change was not saved…" (per-site writes from the page only log it).

## Per-site

- Per-site override writes survive tab reload (covered by sitePrefStored schema regression — the override must NOT be silently stripped).

## Theme + display

- A theme change reaches every open surface through the settings-change listener; each sets data-theme on its root (tooltip: shadow host), and 'system' removes it.
- Display-mode change applies to the next translate trigger without page reload; a mounted tooltip stays as is.
