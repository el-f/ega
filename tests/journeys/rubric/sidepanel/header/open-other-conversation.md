# Side panel header open-other-conversation rubric

## Latency budgets

- Site title click -> conversations list visible: <= 150ms.
- Row click -> the picked conversation on screen: <= 300ms.

## State expectations

- Step 1: the panel opens the newest conversation for the page's site, and the header names that site ("example.com").
- Step 2 (site title): a list opens with two groups, "This site" and "Other sites". Each row shows the conversation's first line as its title, then the message count or site and how long ago it was used. The open conversation is marked with a check and "open now" in its name. The footer says how many conversations are kept.
- Step 3 (pick a row): the list closes, the conversation opens, focus goes to the message box, and screen readers hear "Showing the conversation for {site}".
- Step 4: a conversation from another site opens too, and the header names that site.
- Step 5: opening counts as use: the next time the panel opens on that site, it shows the conversation opened last.

## Visible affordances

- Up and Down move between rows; Right reaches a row's Delete, Left comes back; Esc closes the list and returns focus to the site title.
- Long titles end with an ellipsis; the full title stays in the row's accessible name.

## Failure-mode expectations

- An unreadable conversation list shows an empty list, never a stuck spinner.

## Cautions

- Opening a conversation never changes or reorders the stored messages.
