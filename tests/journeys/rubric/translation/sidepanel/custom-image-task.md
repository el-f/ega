# Sidepanel custom-image-task rubric

## Latency budgets

- Send click -> backend request: <= 2s with the mock backend.

## State expectations

- Step 1: the user picks a custom task that accepts images in the "Next message" popover and drops an image on the composer.
- Step 2: the mode chip keeps the task's name (not "Translate image → …"), and the next-send line shows "Image" with a thumbnail and a remove ×.
- Step 3: the vision request carries the image and the task's instructions.

## Visible affordances

- The attached image shows as a small thumbnail in the composer's "Next message" row.

## Failure-mode expectations

- With no backend that reads images, the reply shows the "No backend reads images" error.

## Cautions

- A custom task that does not accept images sends an attached image to Translate; the chip says "Translate image → {Target}" before the send.
