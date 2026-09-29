# Recipes-gallery surface rubric

## Mount + render

- Gallery groups bundled recipes by task; each group has a heading; each recipe card carries title + summary + tags.
- Filter chip row narrows visible groups without page reload.

## Apply modes

- Apply offers two modes: rules-only (additive — append the recipe's rules) and full (overwrite template + append rules).
- Full-apply requires explicit confirm; the confirm dialog names what will be replaced.

## Persistence

- Rules-only-apply writes to `rules` without touching templates.
- Full-apply writes to `templates[scope]` AND appends to `rules`.

## A11y

- Recipe cards are keyboard-activatable; Apply controls have clear accessible names.
