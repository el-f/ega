# Sidepanel ask-instead rubric

## Latency budgets

- "Ask instead" pressed -> the new version starts streaming: <= 150ms.
- Answer first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: a Translate reply whose source language is not the target shows no offer.
- Step 2: a Translate reply that finds its text already in the target language shows "Already in English" and a text button "Ask instead" in the meta line. The direction is not shown while the offer is.
- Step 3 (Ask instead): the same text is asked about the reply before it, with the conversation as context, as a new version of this reply. The pager reads 2/2 and the answer is prose. The translation stays as version 1.
- Step 4: the offer is gone, the meta line reads "Answer", and the composer is in Ask mode about the new answer.

## Visible affordances

- "Ask instead" is a text button inside the one-line meta line; it keeps the 28px target the meta line allows.
- More -> "Answer again as" -> Ask does the same thing.

## Failure-mode expectations

- A first message with no reply before it is asked with no earlier result; the offer reads the same.
- If the answer fails, the translation stays as the other version and Retry applies to the Ask version.

## Cautions

- Nothing is guessed on send: the offer appears only after the reply says its text was already in the target language, and one click is all the mistake costs.
