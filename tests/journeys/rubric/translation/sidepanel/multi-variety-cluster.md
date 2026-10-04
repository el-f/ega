# Sidepanel multi-variety-cluster rubric

## Latency budgets

- Cluster render after stream completion: <= 150ms.

## State expectations

- Step 1: the user sends text from the side panel input; the backend answer lists two or more detected languages (`detectedLangs`).
- Step 2: the assistant turn's meta row shows one `.ega-lang-pill` per language, in the order the backend listed them.
- Step 3: no single detected-language pill renders beside the cluster.

## Visible affordances

- Each pill shows the preset or language label, then the detail when it adds something ("Arabizi — Levantine", "English").
- Hover shows the same label in the panel tooltip; the pills are not buttons.

## Failure-mode expectations

- A one-item list falls back to the single pill; the cluster is multi-only.
- Pills wrap inside the turn at side-panel width; no horizontal scroll.

## Cautions

- Same rule as the tooltip cluster: no cap and no "+N more" expander.
