import { dispatchAsUser } from './user-gesture';
import { debugCatch } from '@/shared/logger';
// A spec cannot read this isolated world's `window`, so commands and replies ride the DOM.

import { getShadowRoot } from './shadowHost';
import { assertNever } from '@/shared/invariants';
import { uuid } from '@/shared/uuid';

type OpName =
  | 'hasHost'
  | 'tooltipCount'
  | 'tooltipBody'
  | 'tooltipSrc'
  | 'hasError'
  | 'isLoading'
  | 'listButtons'
  | 'clickAction'
  | 'pressEscape'
  | 'pickerIsActive'
  | 'pickerOutlineCount'
  | 'inlineCount'
  | 'inlineTextAt'
  | 'msIsActive'
  | 'msSelectedCount'
  | 'msSelectById'
  | 'msFire'
  | 'pageV2TxCount'
  | 'pageV2TxTextAt'
  | 'bubbleCount'
  | 'bubbleLabel'
  | 'bubbleRect'
  | 'bubbleQueuedBadge'
  | 'bubbleDirection'
  | 'tooltipDirection'
  | 'clickBubble'
  | 'shiftClickBubble'
  | 'taskSelectOptionLabel'
  | 'setTooltipSelect'
  | 'tooltipHoverLabelGeometry'
  | 'tooltipMetaGeometry'
  | 'tooltipRect'
  | 'tooltipOverflowGeometry'
  | 'expandTooltipContextPreview'
  | 'dispatchImageTranslate';

interface CmdDetail {
  id: string;
  op: OpName;
  arg?: string;
}

function run(op: OpName, arg?: string): unknown {
  const host = document.getElementById('ega-shadow-host');
  if (!host && op === 'hasHost') return false;
  switch (op) {
    case 'hasHost':
      return !!host;
    case 'tooltipCount':
      return getShadowRoot().querySelectorAll('.tooltip').length;
    case 'tooltipBody': {
      const b = getShadowRoot().querySelector('.tooltip .body');
      return b ? b.textContent.trim() : null;
    }
    case 'tooltipSrc': {
      const s = getShadowRoot().querySelector('.tooltip .src');
      return s ? s.textContent.trim() : null;
    }
    case 'hasError':
      // Not [data-ega-retry]: terminal codes (AUTH, QUOTA, …) render no Retry button.
      return !!getShadowRoot().querySelector(
        '.tooltip .tooltip-error-body, .tooltip .tooltip-error-line',
      );
    case 'isLoading':
      return !!getShadowRoot().querySelector('.tooltip .shimmer');
    case 'listButtons':
      return Array.from(getShadowRoot().querySelectorAll<HTMLButtonElement>('.tooltip button')).map(
        (b) => b.getAttribute('aria-label') ?? b.textContent.trim(),
      );
    case 'clickAction': {
      if (!arg) return false;
      const needle = arg.toLowerCase();
      const btns = Array.from(
        getShadowRoot().querySelectorAll<HTMLButtonElement>('.tooltip button[aria-label]'),
      );
      const btn = btns.find((b) =>
        (b.getAttribute('aria-label') ?? '').toLowerCase().includes(needle),
      );
      if (!btn) return false;
      dispatchAsUser(btn, new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    case 'pressEscape': {
      const tt = getShadowRoot().querySelector<HTMLElement>('.tooltip');
      if (!tt) return false;
      tt.focus();
      dispatchAsUser(tt, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
    case 'pickerIsActive': {
      return !!getShadowRoot().querySelector('[data-ega-picker-wrap]');
    }
    case 'pickerOutlineCount':
      // `:not([hidden])` — the outline is mounted for the whole session and only painted on hover.
      return getShadowRoot().querySelectorAll('.picker-outline:not([hidden])').length;
    case 'inlineCount':
      return document.querySelectorAll('[data-ega-replaced]').length;
    case 'inlineTextAt': {
      if (!arg) return null;
      const el = document.getElementById(arg);
      return el ? el.textContent : null;
    }
    case 'msIsActive':
      return !!getShadowRoot().querySelector('[data-ega-ms-wrap]');
    case 'msSelectedCount':
      return document.querySelectorAll('[data-ega-ms-selected]').length;
    case 'msSelectById': {
      if (!arg) return null;
      const el = document.getElementById(arg);
      if (!el) return null;
      dispatchAsUser(el, new MouseEvent('click', { bubbles: true, cancelable: true }));
      return el.hasAttribute('data-ega-ms-selected');
    }
    case 'msFire': {
      const btn = getShadowRoot().querySelector<HTMLButtonElement>('[data-ega-ms-translate]');
      if (!btn) return null;
      dispatchAsUser(btn, new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    case 'pageV2TxCount':
      return document.querySelectorAll('[data-ega-tx]').length;
    case 'pageV2TxTextAt': {
      if (!arg) return null;
      const el = document.getElementById(arg);
      const sib = el?.nextElementSibling;
      return sib?.hasAttribute('data-ega-tx') ? sib.textContent : null;
    }
    case 'bubbleCount':
      return getShadowRoot().querySelectorAll('.bubble').length;
    case 'bubbleLabel': {
      const b = getShadowRoot().querySelector('.bubble');
      return b ? b.textContent.replace(/\s+/g, ' ').trim() : null;
    }
    case 'bubbleRect': {
      const b = getShadowRoot().querySelector<HTMLElement>('.bubble');
      if (!b) return null;
      const box = b.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    }
    case 'bubbleQueuedBadge': {
      const badge = getShadowRoot().querySelector('.bubble .badge');
      return badge ? badge.textContent.trim() : null;
    }
    case 'clickBubble': {
      const btn = getShadowRoot().querySelector<HTMLButtonElement>('.bubble');
      if (!btn) return false;
      dispatchAsUser(btn, new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    }
    case 'shiftClickBubble': {
      const btn = getShadowRoot().querySelector<HTMLButtonElement>('.bubble');
      if (!btn) return false;
      dispatchAsUser(
        btn,
        new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }),
      );
      return true;
    }
    case 'bubbleDirection': {
      const d = getShadowRoot().querySelector('.bubble .direction');
      return d ? d.textContent.trim() : null;
    }
    case 'tooltipDirection': {
      const d = getShadowRoot().querySelector('.tooltip [data-ega-direction]');
      return d ? d.textContent.trim() : null;
    }
    case 'tooltipOverflowGeometry': {
      // One payload, so every number is read in the same tick.
      const r = getShadowRoot();
      const tip = r.querySelector<HTMLElement>('.tooltip');
      if (!tip) return null;
      const box = tip.getBoundingClientRect();
      // Every page-info value in the details panel, the full address row included.
      const ddList = Array.from(
        r.querySelectorAll<HTMLElement>(
          '.tooltip .reply-details dd, .tooltip .reply-details .rd-url',
        ),
      );
      const ddOverflow = ddList.map((dd) => ({
        scrollWidth: dd.scrollWidth,
        offsetWidth: dd.offsetWidth,
      }));
      // `document.getSelection()` returns the same Selection object across worlds.
      let selTop: number | null = null;
      let selBottom: number | null = null;
      try {
        const range = document.getSelection()?.getRangeAt(0);
        const rr = range?.getBoundingClientRect() ?? null;
        if (rr) {
          selTop = rr.top;
          selBottom = rr.bottom;
        }
      } catch (e) {
        debugCatch(e, 'content.testHooks.1');
      }
      return {
        tipTop: box.top,
        tipBottom: box.bottom,
        tipHeight: box.height,
        innerHeight: window.innerHeight,
        selectionTop: selTop,
        selectionBottom: selBottom,
        ddOverflow,
      };
    }
    case 'expandTooltipContextPreview': {
      const r = getShadowRoot();
      const btn = r.querySelector<HTMLButtonElement>(
        '.tooltip button[aria-label="Show details about this reply"]',
      );
      if (!btn) return false;
      btn.click();
      // The panel renders on the next tick; open every page field so the address row exists.
      return new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          const all = Array.from(r.querySelectorAll<HTMLButtonElement>('.tooltip .rd-link')).find(
            (b) => b.textContent.trim() === 'Show all page info',
          );
          all?.click();
          requestAnimationFrame(() => resolve(true));
        });
      });
    }
    case 'tooltipRect': {
      const r = getShadowRoot();
      const tip = r.querySelector<HTMLElement>('.tooltip');
      if (!tip) return null;
      const box = tip.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    }
    case 'tooltipHoverLabelGeometry': {
      const r = getShadowRoot();
      const body = r.querySelector<HTMLElement>('.tooltip .body');
      const btn = r.querySelector<HTMLElement>('.tooltip .actions .icon-btn[data-tooltip]');
      if (!body || !btn) return null;
      const bodyRect = body.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      let topRule: string | null = null;
      let bottomRule: string | null = null;
      const styleEls = r.querySelectorAll('style');
      for (const s of Array.from(styleEls)) {
        const text = s.textContent;
        // Minifier may collapse `::after` → `:after` so match both forms.
        const m = text.match(/\.icon-btn\[data-tooltip\][^{]*?:hover::?after[^{]*\{([^}]*)\}/);
        if (m?.[1]) {
          const block = m[1];
          // `[^\s;]` on the first value char stops the two classes swapping matches, which backtracks super-linearly.
          const topMatch = block.match(/(?:^|[;\s])top:\s*([^\s;][^;]*)(?:;|$)/);
          const bottomMatch = block.match(/(?:^|[;\s])bottom:\s*([^\s;][^;]*)(?:;|$)/);
          if (topMatch?.[1]) topRule = topMatch[1].trim();
          if (bottomMatch?.[1]) bottomRule = bottomMatch[1].trim();
          break;
        }
      }
      return {
        bodyBottom: bodyRect.bottom,
        bodyTop: bodyRect.top,
        btnTop: btnRect.top,
        btnBottom: btnRect.bottom,
        topRule,
        bottomRule,
      };
    }
    case 'tooltipMetaGeometry': {
      const r = getShadowRoot();
      const actions = r.querySelector<HTMLElement>('.tooltip .actions');
      const meta = r.querySelector<HTMLElement>('.tooltip .meta');
      if (!meta) return null;
      const metaRect = meta.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect() ?? null;
      const metaParentClass = meta.parentElement?.className ?? '';
      // The first icon marks the action row; the meta pills end that row or wrap below it.
      const firstIcon = r.querySelector<HTMLElement>('.tooltip .actions .icon-btn');
      const firstIconRect = firstIcon?.getBoundingClientRect() ?? null;
      return {
        actionsRect: actionsRect
          ? {
              left: actionsRect.left,
              top: actionsRect.top,
              right: actionsRect.right,
              bottom: actionsRect.bottom,
              width: actionsRect.width,
              height: actionsRect.height,
            }
          : null,
        metaRect: {
          left: metaRect.left,
          top: metaRect.top,
          right: metaRect.right,
          bottom: metaRect.bottom,
          width: metaRect.width,
          height: metaRect.height,
        },
        firstIconRect: firstIconRect
          ? {
              left: firstIconRect.left,
              top: firstIconRect.top,
              right: firstIconRect.right,
              bottom: firstIconRect.bottom,
              width: firstIconRect.width,
              height: firstIconRect.height,
            }
          : null,
        metaParentClass,
      };
    }
    case 'taskSelectOptionLabel': {
      if (!arg) return null;
      const sel = getShadowRoot().querySelector<HTMLSelectElement>(
        'select[aria-label="Task"][data-ega-task-select]',
      );
      if (!sel) return null;
      const opt = Array.from(sel.options).find((o) => o.value === arg);
      return opt ? opt.textContent.trim() : null;
    }
    case 'setTooltipSelect': {
      // arg is `task:<value>` or `tone:<value>`; Playwright's selectOption cannot reach the shadow root.
      const [which, value] = (arg ?? '').split(':');
      if ((which !== 'task' && which !== 'tone') || !value) return null;
      const sel = getShadowRoot().querySelector<HTMLSelectElement>(
        `select[data-ega-${which}-select]`,
      );
      if (!sel) return false;
      sel.value = value;
      dispatchAsUser(sel, new Event('change', { bubbles: true }));
      return true;
    }
    case 'dispatchImageTranslate': {
      // Sending from the content script gives the worker a `sender.tab` to reply to.
      if (!arg) return null;
      const requestId = uuid();
      void chrome.runtime
        .sendMessage({ kind: 'image:translate', requestId, imageUrl: arg })
        .catch(() => {});
      return requestId;
    }
    default:
      return assertNever(op);
  }
}

export function installTestHooks(): void {
  if (!__EGA_E2E_HOOKS__) return;
  document.documentElement.setAttribute('data-ega-test-ready', '1');
  document.addEventListener('ega:test:cmd', (e: Event) => {
    // The payload is untrusted at runtime, so guard it even though the type says otherwise.
    const detail = (e as CustomEvent<Partial<CmdDetail>>).detail;
    if (!detail.id || !detail.op) return;
    const writeReply = (ok: boolean, value: unknown): void => {
      document.documentElement.setAttribute(
        `data-ega-test-${detail.id ?? ''}`,
        JSON.stringify({ ok, value }),
      );
    };
    let value: unknown;
    try {
      value = run(detail.op, detail.arg);
    } catch (err) {
      writeReply(false, String(err));
      return;
    }
    // Resolve first: JSON.stringify of a pending promise writes `{}`.
    if (value !== null && typeof value === 'object' && 'then' in (value as { then?: unknown })) {
      void (value as Promise<unknown>)
        .then(
          (v) => writeReply(true, v),
          (err: unknown) => writeReply(false, String(err)),
        )
        .catch(() => {
          /* writeReply doesn't throw; defensive */
        });
      return;
    }
    writeReply(true, value);
  });
}
