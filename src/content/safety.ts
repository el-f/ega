const SENSITIVE_NAME_RE =
  /\b(?:password|passwd|pwd|cvv|cvc|security[-_\s]*code|card[-_\s]*number|creditcard|ssn|pin|otp|totp|2fa|mfa|verification[-_\s]*code|secret|token|api[-_\s]*key|private[-_\s]*key|seed[-_\s]*phrase|mnemonic|recovery|iban|routing|tax[-_\s]*id)\b/i;
const SENSITIVE_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code']);

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(el: Element): el is TextField {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/** Every string a page can use to name a field. Plenty of forms leave `name` and `id` opaque and say it in the label. */
function fieldNames(el: TextField): string[] {
  const out = [el.name, el.id, el.getAttribute('aria-label') ?? '', el.placeholder, el.title];
  for (const label of el.labels ?? []) out.push(label.textContent);
  for (const ref of (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
    if (ref) out.push(el.ownerDocument.getElementById(ref)?.textContent ?? '');
  }
  return out;
}

function looksSensitive(el: Element): boolean {
  if (!isTextField(el)) return false;
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  const ac = el.autocomplete.toLowerCase();
  if (ac.startsWith('cc-') || SENSITIVE_AUTOCOMPLETE.has(ac)) return true;
  return fieldNames(el).some((n) => SENSITIVE_NAME_RE.test(n));
}

/** The hotkey and the context menu skip the selection-time gate, so they check the live selection with this.
 *  Secret fields only: a selection inside a rich-text composer is something the user asked to translate. */
export function selectionIsSensitive(range: Range | undefined, active: Element | null): boolean {
  const node = range?.commonAncestorContainer;
  const rangeEl = node === undefined ? null : node instanceof Element ? node : node.parentElement;
  return isSecretTarget(rangeEl) || isSecretTarget(active);
}

/** A password, card or one-time-code field, or anything under `data-ega-skip`. */
function isSecretTarget(el: Element | null): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.hasAttribute('data-ega-skip')) return true;
    if (looksSensitive(cur)) return true;
  }
  return false;
}

/** A drag-selection leaves `document.activeElement` on `<body>`, so the range is the only
 *  thing that points at what the user actually selected. */
export function isSensitiveRange(range: Range): boolean {
  const node = range.commonAncestorContainer;
  const el = node instanceof Element ? node : node.parentElement;
  return isSensitiveTarget(el);
}

export function isSensitiveTarget(el: Element | null): boolean {
  if (!el) return false;
  const htmlEl = el as HTMLElement;
  if (
    htmlEl.isContentEditable ||
    htmlEl.contentEditable === 'true' ||
    el.getAttribute('contenteditable') === 'true'
  )
    return true;
  if (el.getAttribute('role') === 'textbox') return true;
  return isSecretTarget(el);
}
