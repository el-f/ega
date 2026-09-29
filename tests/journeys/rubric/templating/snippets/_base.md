# Snippets surface rubric

## Mount + render

- Snippet list renders one row per snippet (name + body excerpt + rename + delete).
- Empty state names what a snippet is and how to add one.

## Add / edit

- Add seeds a fresh entry and focuses the body textarea.
- Body textarea persists per-keystroke (snippets are the only template surface with auto-save — explicit semantics for quick capture).

## Rename + delete

- Rename dialog updates the storage key while preserving the body.
- Delete confirms; on confirm, the row removes from the list.
