# Picker surface rubric

## Mount + position

- Picker overlay mounts within 150ms of `picker:enter` reaching the active tab.
- Outline tracks pointer position; rect updates within 1 animation frame (~16ms) of pointermove.

## Targeting

- Hover paints an outline at the candidate element's bounding rect — outline uses tokens, not raw colors.
- Click selects the target, exits picker, mounts the tooltip with the element's text or image.
- Clicks on password / hidden / readonly inputs are rejected; picker stays mounted so the user can pick again.
- Click on an empty element exits picker and surfaces a toast ("Nothing translatable here").

## Dismissal

- Esc exits picker without firing a translate.
- `pickerEnabled === false` makes `picker:enter` a no-op (no overlay, no toast).
