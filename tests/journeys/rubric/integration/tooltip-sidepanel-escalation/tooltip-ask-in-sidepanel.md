# Tooltip-sidepanel-escalation tooltip-ask-in-sidepanel rubric

## Latency budgets

- Ask click -> side panel open with the exchange seeded and Ask mode on: <= 800ms.

## State expectations

- Step 1: a finished text result in the tooltip shows an Ask button, second after Copy, named "Ask about this in the side panel".
- Step 2: the user presses Ask. The tooltip hands the result to the side panel, with the languages and the dialect it detected.
- Step 3: the panel opens on this site's conversation with the result added as an exchange. The reply shows the same direction the tooltip showed ("Arabizi (Levantine) → English").
- Step 4: Ask mode is on for that reply: the banner "Asking about this reply", the bar on the reply, focus in the field. No "Language, task and tone set" toast shows.
- Step 5: the user types a question without clicking and presses Enter. The request carries the original text, the result and "Levantine".

## Visible affordances

- The tooltip row stays one line with six buttons.
- Keys typed right after the panel opens reach the field, because the field has focus.

## Failure-mode expectations

- The panel cannot open (no user gesture, an old browser, the panel is disabled) -> the tooltip stays and the page toast says Ega could not open the side panel. The result stays.
- Ask is not offered while the answer streams, on an error, on an image result, or when the Ask task is off.

## Cautions

- The handoff reader keeps `ask` only when it is exactly true, and caps the detected strings; page text never decides the mode.
- A panel already editing a message or describing a change keeps its composer; only the exchange lands.
