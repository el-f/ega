# Sidepanel ask-about-reply rubric

## Latency budgets

- Ask pressed -> banner "Asking about this reply" shown and focus in the field: <= 100ms.
- Question sent -> first answer text: same as a translation, warm <= 1.5s, cold <= 4s.
- Quote pressed -> the first reply scrolled into view and focused: <= 400ms.

## State expectations

- Step 1: a first message is translated; its meta line reads "Arabizi (Levantine) → English".
- Step 2 (Ask on the reply): the composer shows the banner "Asking about this reply" with a × named "Done asking". The field is empty with the placeholder "Ask about this reply" and has focus. The reply is marked by a 2px accent bar on its start side, and its Ask button is pressed. A draft typed before waits.
- Step 3 (send a question): the question bubble shows a one-line quote of the reply, then the question. The answer streams below as prose. The request carries the reply's original text, its result, its languages with the detected detail, and the question.
- Step 4: the composer keeps asking, now about the answer; the bar moves to the answer. The answer's meta line reads "Answer", with no languages and no confidence.
- Step 5 (press the quote): the thread scrolls to the first reply, the reply flashes briefly and takes focus.
- Step 6 (×): the banner goes, the composer is back on its task ("Translate → English") with the earlier draft restored, and focus stays in the field.
- Step 7 (the first message is deleted): the quote on the question reads "Reply removed" in plain text, and is not a button.

## Visible affordances

- The Ask button sits second in the reply row, after Copy; the row is Copy, Ask, Refine, More. Regenerate is the first item of the Refine menu.
- The quote is a real button whose name is the quoted text, then "Go to the reply".
- More -> About this reply shows an "Asked about" row on the answer.
- The composer's live region says "Asking about the reply: ..." on entry, "Now asking about the new answer" when the answer lands, and "Back to ..." on leaving.

## Failure-mode expectations

- A reply that is still streaming, failed or empty has no Ask button.
- A question that fails keeps its quote on retry; Retry sends the same reply again.
- Esc leaves Ask mode when nothing is running, and restores the draft from before it; a typed, unsent question is dropped. While an answer runs, Esc stops it first.

## Cautions

- The reply's text is untrusted: it reaches the model fenced inside the "about" block, never as instructions.
- Ask never changes the reply it is about; the answer is a new message.
