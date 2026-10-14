# Options-backends labs-probe-ttl-slider rubric

## Latency budgets

- Thumb release -> storage write: <= 200ms.

## State expectations

- Step 1: the Backends tab's "Timeouts and checks" card has the slider "Remember backend status for" with an "Experimental" pill and the hint "Lower checks more often; higher notices a backend coming back later".
- Step 2: two steps right from the default 30 s write `advanced.backendProbeTtlMs = 40000` when the thumb is released.
- Step 3: the word "Changed" shows after the label.

## Visible affordances

- The default shows as a tick on the track; the readout reads "40 s".
- There is no Labs sub-tab and no "Experimental" paragraph.

## Cautions

- The setting is shared with the router's probe cache; the next probe uses the new value.
