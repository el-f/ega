# Site off-switch surface rubric

## What "off" means

- `sitePrefs` is keyed on `location.origin` (scheme + host + port), never on a bare host. Two
  entries for the same site is a bug: the reader sees only one of them.
- Off means every entry point is off, not just the visible one: smart bubble, translate hotkey,
  picker mode, translate-areas, and the popup selection cache.
- Nothing about the page may leave the browser while the site is off. A request that fires and is
  then discarded still sent the user's text to a model.

## Feedback

- A user-initiated action on a disabled site says so once, in a toast: "Ega is off for this site. Right-click the page and choose \"Enable Ega on this site\"."
- The toast names the site scope, not the extension state, so the user knows the fix is per-site.

## Re-enabling

- Turning the site back on takes effect on the next selection or hotkey, with no page reload.
- Re-enabling must not resurrect a translation from before the site was turned off.
