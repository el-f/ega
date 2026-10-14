# Options-tasks compiled-preview rubric

## Latency budgets

- Preview tab click -> built prompt visible: <= 150ms.

## State expectations

- Step 1: in a task dialog (Translate here), the prompt section has an "Edit | Preview" tab pair next to its title.
- Step 2 (Preview): the fields give way, in the same place, to the prompt as Ega sends it: "System", "Earlier messages", "Message".
- Step 3: the System part ends with the answer format the builder appends ("Return JSON ONLY ..."); Edit brings the fields back with the caret where it was.

## Visible affordances

- One line names the sample text: "Shown with the sample text ... and your settings".
- The Translate prompt and language prompts offer "Preview as Translate | Explain"; task prompts do not.
- "Earlier messages" is one muted line, not a box. Text is monospace on a sunken background with no border and no inner scroll.

## Failure-mode expectations

- A build error reads "The preview could not be built: <reason>" in the error colour.

## Cautions

- The preview calls the same builder the router uses, so what it shows is what is sent.
