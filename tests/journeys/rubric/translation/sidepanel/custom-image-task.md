# Sidepanel custom-image-task rubric

## Latency budgets

- Send click -> backend request: <= 2s with the mock backend.

## State expectations

- Step 1: the user picks a custom task that accepts images and drops an image on the composer.
- Step 2: the send button keeps the task's name, not "Translate image".
- Step 3: the vision request carries the image and the task's instructions.

## Visible affordances

- The attached image shows as a thumbnail in the composer.

## Failure-mode expectations

- With no backend that reads images, the turn shows the "No backend that reads images" error.

## Cautions

- A custom task that does not accept images sends an attached image to Translate instead.
