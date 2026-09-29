# Settings-runtime-propagation quota-near-full-degrades-gracefully rubric

## Latency budgets

- Quota-near-full detection -> warning toast: <= 500ms.

## State expectations

- Step 1: simulated `chrome.storage.local` quota at 90%+; user makes a settings change.
- Step 2: the write succeeds (still under quota); a warning toast surfaces naming the storage pressure with a "Clean up" CTA.
- Step 3: the audit log still appends; settings writes still flow.

## Visible affordances

- Toast uses the warning tone tokens; auto-dismiss after 8s.
- "Clean up" CTA jumps to the Diagnostics tab where the user can clear audit log / site overrides.

## Failure-mode expectations

- Quota at 100% -> writes fail; the toast escalates to danger tone with a "Clear log" CTA as primary.

## Cautions

- The detection must NOT block writes preemptively — chrome.storage's quota check is the source of truth.
- The toast must NOT spam; rate-limit to once per session.
