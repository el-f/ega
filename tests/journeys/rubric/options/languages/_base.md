# Options-languages surface rubric

## Mount + render

- Tab lists configured custom varieties as rows; empty state surfaces an Add form.
- Each row carries label + base language + a Delete action.

## Add / delete

- Add form seeds a row into `customLanguages`; submit closes the form and surfaces the new row.
- Delete confirms; on confirm, the row removes from the list and from storage.

## Export

- Export-as-JSON triggers a single download with a meaningful filename (no spaces, includes date).
- Export is read-only — it never mutates `customLanguages`.
