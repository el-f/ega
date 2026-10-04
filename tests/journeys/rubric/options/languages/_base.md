# Options-languages surface rubric

## Mount + render

- Tab lists every language (built-in + custom) as rows, sorted by label; the Add form opens from the header "Add custom language" (+) button, or from the "Add your own language" button shown while no custom language exists.
- The list card's description says what the checkbox and the pencil do.
- Each row carries an enable checkbox, label, Built-in/Custom badge (+ "edited" when overridden), hint, example count spelled out ("1 example", "3 examples"), and Edit; custom rows also get Delete.

## Add / delete

- Add form seeds a row into `customLanguages`; submit closes the form and surfaces the new row.
- Delete confirms; on confirm, the row removes from the list and from storage.

## Export

- Export-as-JSON triggers a single download with a meaningful filename (no spaces, includes date).
- Export is read-only — it never mutates `customLanguages`.
