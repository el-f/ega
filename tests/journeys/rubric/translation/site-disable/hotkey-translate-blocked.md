# Site off-switch hotkey-translate-blocked rubric

## Latency budgets

- Hotkey press -> "Ega is off on {host}." toast: <= 300ms. The gate is a settings read, not a
  network call.

## State expectations

- Step 1: the site carries `sitePrefs[origin].disabled === true`.
- Step 2: the user selects text and presses the translate shortcut.
- Step 3: a toast says the site is off. No tooltip mounts, in any state — not loading, not error.
- Step 4: no `translate:start` reaches the service worker, so no backend request is made.

## Visible affordances

- The toast is the only new element on the page. No loading spinner, no empty tooltip frame.
- The user's selection stays intact — the gate must not clear it.

## Failure-mode expectations

- A tooltip that mounts and then disappears is a failure, not a cosmetic one: it means the request
  path ran before the gate.
- The picker shortcut on the same page must be gated the same way.

## Cautions

- Check the tooltip across a window of time, not once: an async gate can let a tooltip paint first.
- The shortcut is user-configurable; the rubric is about the gate, not about the default binding.
