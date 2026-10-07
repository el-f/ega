// Side panel spec §13.2: the countable design rules, measured on the real layout jsdom cannot give.
import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  customTask,
  launchExtension,
  mockAnthropic,
  newestReply,
  openReplyMenu,
  resetRoutes,
  seedCustomTasks,
  seedSettings,
  sendFromPanel,
  type ExtensionHandle,
} from './helpers';
import { DEFAULT_SETTINGS } from '../../src/shared/settings-defaults';
import {
  FOLLOW_FIXTURE_SCRIPT,
  SITE,
  T,
  WIDTHS,
  openExampleTab,
  openPanel,
  realMeta,
  reloadPanel,
  reply,
  seedConversations,
  user,
} from './sidepanel-audit';

let ext: ExtensionHandle;

const SEED = {
  anthropicApiKey: 'sk-test',
  streaming: true,
  captureResultMeta: true,
  confidencePill: true,
  confidencePillThreshold: 0,
  contextEnabled: true,
  pageContextLevel: 'minimal' as const,
};

test.beforeAll(async () => {
  ext = await launchExtension();
  await seedSettings(ext.context, ext.extensionId, SEED);
  await ext.context.addInitScript(FOLLOW_FIXTURE_SCRIPT);
  await openExampleTab(ext.context);
});

test.afterAll(async () => {
  await ext.close();
});

const FIRST_PAIR = [user('u1', 'hola', T(28)), reply('a1', 'u1', T(28))];
const TWO_PAIRS = [
  ...FIRST_PAIR,
  user('u2', 'adios amigo', T(20)),
  reply('a2', 'u2', T(20), { content: 'Goodbye, friend.' }),
];

async function panelWith(conversations: Parameters<typeof seedConversations>[1]): Promise<Page> {
  const sp = await openPanel(ext.context, ext.extensionId);
  await sp.emulateMedia({ reducedMotion: 'reduce' });
  await seedConversations(sp, conversations);
  await reloadPanel(sp);
  return sp;
}

async function applyTheme(sp: Page, theme: 'light' | 'dark'): Promise<void> {
  await sp.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
    document.documentElement.style.colorScheme = t;
  }, theme);
  await sp.waitForTimeout(150); // wait for the custom-property cascade to repaint (no observable end state)
}

/**
 * Waits until a menu or popover sits in the panel and holds still. bits mounts it above the page, where Playwright
 * already calls it visible, and moves it into place a frame or more later.
 */
async function settle(layer: Locator, what: string): Promise<void> {
  await layer.evaluate(
    (el, name) =>
      new Promise<void>((resolve, reject) => {
        let last = '';
        let still = 0;
        let frames = 0;
        const frame = (): void => {
          const r = el.getBoundingClientRect();
          const now = `${r.left} ${r.top} ${r.width} ${r.height}`;
          still = now === last && r.bottom > 0 && r.top < window.innerHeight ? still + 1 : 0;
          last = now;
          if (still >= 2) resolve();
          else if (++frames > 120) reject(new Error(`${name}: never held still in the panel`));
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    what,
  );
}

/** Opens a reply menu on the newest reply unless it is open already. */
async function keepMenu(sp: Page, which: 'refine' | 'more'): Promise<void> {
  const trigger = newestReply(sp).locator(`[data-ega-action="${which}"]`);
  if ((await trigger.getAttribute('aria-expanded')) === 'true') return;
  await trigger.click();
  await sp.getByRole('menu').waitFor({ state: 'visible' });
}

interface State {
  name: string;
  build: () => Promise<Page>;
  /** Puts back what a resize or a theme switch closed (menus, popovers). Safe to call when it is open. */
  ensure?: (sp: Page) => Promise<void>;
  /** Undoes what the build changed outside the page (settings). */
  after?: () => Promise<void>;
}

const LONG_MARKDOWN =
  '## What it does\n\n- Reads the list\n- Sorts it by date\n\n```ts\nconst sorted = items.sort((a, b) => a.date - b.date);\n```\n\n| Step | Result |\n| --- | --- |\n| 1 | read |\n| 2 | sort |\n\nThe link points to https://example.com/a/very/long/path/that/keeps/going/and/going/without/a/break';

const STATES: State[] = [
  { name: 'empty', build: () => panelWith([]) },
  {
    // The chip reads "Set up backend"; its name must start with that label (check 11).
    name: 'empty-no-backend',
    build: async () => {
      await seedSettings(ext.context, ext.extensionId, {
        anthropicApiKey: '',
        disabledBackends: ['native', 'ollama', 'localserver'],
      });
      const sp = await panelWith([]);
      await sp.locator('[data-ega-sidepanel-empty]').waitFor({ state: 'visible' });
      return sp;
    },
    after: () =>
      seedSettings(ext.context, ext.extensionId, {
        ...SEED,
        disabledBackends: DEFAULT_SETTINGS.disabledBackends,
      }),
  },
  { name: 'first-exchange', build: () => panelWith([{ id: SITE, turns: FIRST_PAIR }]) },
  {
    name: 'long-thread',
    build: async () => {
      const turns: Record<string, unknown>[] = [];
      for (let i = 0; i < 12; i++) {
        turns.push(user(`u${i}`, `mensaje número ${i}`, T(200 - i)));
        turns.push(reply(`a${i}`, `u${i}`, T(200 - i), { content: `Message number ${i}.` }));
      }
      turns.push(
        user('ul', 'Explícame este código', T(5), { kind: 'explain', trimmedTo: 2000 }),
        reply('al', 'ul', T(5), {
          kind: 'explain',
          content: LONG_MARKDOWN,
          explain: 'The code is TypeScript; `sort` changes the list in place.',
        }),
      );
      const sp = await panelWith([{ id: SITE, turns }]);
      await sp
        .locator('.ega-conv-stream')
        .evaluate((el) => (el.scrollTop = el.scrollHeight - el.clientHeight - 600));
      return sp;
    },
  },
  {
    name: 'streaming-text',
    build: async () => {
      // The request hangs, so the reply stays live until the worker hands it text.
      await ext.context.route('https://api.anthropic.com/v1/messages', () => undefined);
      const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
      await sendFromPanel(sp, 'cuéntame una historia larga');
      await sp.locator('.ega-skeleton').waitFor({ state: 'visible' });
      const requestId = await sp.evaluate(
        () => (globalThis as { __egaLastRequestId?: string }).__egaLastRequestId,
      );
      const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long story.`).join(
        '\\n',
      );
      const [sw] = ext.context.serviceWorkers();
      await sw?.evaluate(
        async ({ id, text }) => {
          await chrome.runtime.sendMessage({
            kind: 'translate:chunk',
            chunk: { type: 'delta', requestId: id, text },
          });
        },
        { id: requestId ?? '', text: `{"translation":"${lines}` },
      );
      await sp.locator('.ega-cursor').waitFor({ state: 'visible' });
      return sp;
    },
  },
  {
    name: 'error-auth-details',
    build: () =>
      panelWith([
        {
          id: SITE,
          turns: [
            user('u1', 'hola', T(2)),
            reply('a1', 'u1', T(2), {
              status: 'error',
              content: '',
              meta: null,
              error: { code: 'AUTH', message: 'invalid x-api-key (401)' },
            }),
          ],
        },
      ]),
    ensure: async (sp) => {
      const details = sp.locator('[data-ega-error-details]');
      if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
    },
  },
  {
    name: 'refine-menu',
    build: () => panelWith([{ id: SITE, turns: FIRST_PAIR }]),
    ensure: (sp) => keepMenu(sp, 'refine'),
  },
  {
    name: 'more-menu',
    build: () => panelWith([{ id: SITE, turns: FIRST_PAIR }]),
    ensure: (sp) => keepMenu(sp, 'more'),
  },
  {
    name: 'about-instructions',
    build: async () => {
      // A 9,000-character prompt kept cut at 6,000: the tallest About there is.
      const prompt = `You are a translator. ${'Keep slang and tone as they are. '.repeat(400)}`;
      const meta = realMeta({ instructions: prompt.slice(0, 6000), instructionsLength: 9000 });
      const sp = await panelWith([
        { id: SITE, turns: [user('u1', 'hola', T(28)), reply('a1', 'u1', T(28), { meta })] },
      ]);
      const menu = await openReplyMenu(sp, 'more');
      await menu.locator('[data-ega-about]').click();
      await sp.locator('[data-ega-inspector]').waitFor({ state: 'visible' });
      return sp;
    },
    ensure: async (sp) => {
      const open = sp.locator('[data-ega-inspector] [aria-controls$="-instr"]');
      if ((await open.getAttribute('aria-expanded')) !== 'true') await open.click();
    },
  },
  {
    name: 'mode-popover',
    build: async () => {
      const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
      await sp.locator('[data-ega-mode-chip]').click();
      const popover = sp.locator('[data-ega-mode-popover]');
      await popover.locator('[data-ega-task="reword"]').click();
      await popover.locator('#sp-conv-source').selectOption('es');
      return sp;
    },
    ensure: async (sp) => {
      const chip = sp.locator('[data-ega-mode-chip]');
      if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
      await sp.locator('[data-ega-mode-popover]').waitFor({ state: 'visible' });
    },
  },
  {
    name: 'conversations',
    build: () =>
      panelWith([
        { id: SITE, turns: FIRST_PAIR, updatedAt: T(28) },
        {
          id: `${SITE}#k1aaaaaa`,
          turns: [user('b1', 'una conversación con un título bastante largo', T(90))],
          updatedAt: T(90),
        },
        {
          id: `${SITE}#k1bbbbbb`,
          turns: [user('c1', 'buenos días', T(60 * 26))],
          updatedAt: T(60 * 26),
        },
        { id: 'https://news.example.org', turns: [user('d1', 'salut', T(60 * 50))] },
        { id: 'general', turns: [user('e1', 'hallo', T(60 * 24 * 5))] },
      ]),
    ensure: async (sp) => {
      const site = sp.locator('[data-ega-header-site]');
      if ((await site.getAttribute('aria-expanded')) !== 'true') await site.click();
      await sp.locator('[data-ega-conversations]').waitFor({ state: 'visible' });
    },
  },
  {
    name: 'versions',
    build: () =>
      panelWith([
        {
          id: SITE,
          turns: [
            user('u1', 'hola amigo, ¿qué tal?', T(10)),
            reply('a1', 'u1', T(10), {
              content: 'Hi, friend. How are you?',
              variants: [
                { id: 'a1:v1', status: 'done', content: 'Hello friend, how are you doing?' },
                {
                  id: 'a1:v2',
                  status: 'done',
                  content: 'Hi, friend. How are you?',
                  refinementLabel: 'Shorter',
                  refinementBody: 'Make outputs shorter.',
                },
                {
                  id: 'a1:v3',
                  status: 'done',
                  content: 'Hey buddy, how’s it going?',
                  refinementLabel: 'Less formal',
                  refinementBody: 'Keep outputs less formal than the source.',
                },
              ],
              activeVariantIdx: 1,
            }),
          ],
        },
      ]),
  },
  {
    name: 'backend-popover',
    build: () => panelWith([{ id: SITE, turns: FIRST_PAIR }]),
    ensure: async (sp) => {
      const chip = sp.locator('[data-ega-backend-chip]');
      if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
      await sp.getByRole('dialog', { name: 'Backends' }).waitFor({ state: 'visible' });
    },
  },
  {
    name: 'edit-mode',
    build: async () => {
      const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
      const message = sp.locator('[data-ega-user-turn]').first();
      await message.hover();
      await message.locator('[data-ega-edit]').click();
      await sp.locator('[data-ega-mode-banner]').waitFor({ state: 'visible' });
      return sp;
    },
  },
];

const CHECKS = [
  '1 no cut-off control text',
  '2 only the thread scrolls',
  '3 one action row per reply',
  '4 the composer has at most 3 controls',
  '6 font sizes and spacing come from the tokens',
  '7 no uppercase, two weights',
  '9 the meta line is one line',
  '10 targets are at least 28px (Send and Add 32px)',
  '11 a name starts with the visible label',
  '12 text contrast',
] as const;
type Check = (typeof CHECKS)[number];

/** Every rule but contrast, read from the live layout of the page as it stands. */
async function layoutFindings(sp: Page): Promise<{ check: number; what: string }[]> {
  return sp.evaluate(() => {
    const out: { check: number; what: string }[] = [];
    const add = (check: number, what: string): void => {
      out.push({ check, what });
    };
    const rect = (el: Element): DOMRect => el.getBoundingClientRect();
    const shown = (el: Element): boolean =>
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
      rect(el).width > 1 &&
      rect(el).height > 1;
    const describe = (el: Element): string => {
      const ega = [...el.attributes].find((a) => a.name.startsWith('data-ega-'));
      const tag = el.tagName.toLowerCase();
      const id = ega ? `[${ega.name}${ega.value ? `="${ega.value}"` : ''}]` : '';
      const cls =
        !ega && typeof el.className === 'string' && el.className.trim() !== ''
          ? `.${el.className.trim().split(/\s+/)[0] ?? ''}`
          : '';
      const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${tag}${id}${cls} "${text}"`;
    };
    const px = (v: string): number => Number.parseFloat(v) || 0;
    // Sonner draws the toasts with its own box; the toast contract is shared and checked where it lives.
    const ours = (el: Element): boolean => el.closest('[data-sonner-toaster]') === null;
    const ownText = (el: Element): boolean =>
      [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      );

    // 1. No cut-off control text; an ellipsis only where the spec allows one, with the full text in the name.
    for (const el of document.querySelectorAll(
      'button, a, select, input, label, [role=menuitem], [role=menuitemcheckbox], [role=tab], h1, h2, h3',
    )) {
      if (!shown(el) || !ours(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1)
        add(1, `${describe(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px`);
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el) || !ours(el)) continue;
      if (getComputedStyle(el).textOverflow !== 'ellipsis') continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (!el.matches('[data-ega-truncates]')) {
        add(1, `${describe(el)} is cut with an ellipsis`);
        continue;
      }
      const control = el.closest('button, a, [role=menuitem]') ?? el;
      const name = control.getAttribute('aria-label') ?? control.textContent;
      if (!name.includes(el.textContent.trim()))
        add(1, `${describe(el)} is cut, and the name "${name}" lacks the full text`);
    }

    // 2. No sideways scroll, on the page or in the thread; and only the thread scrolls up and down.
    const se = document.scrollingElement;
    if (se && se.scrollWidth > se.clientWidth)
      add(2, `the page is ${se.scrollWidth}px wide in ${se.clientWidth}px`);
    if (se && se.scrollHeight > se.clientHeight) {
      // Usually an out-of-flow box that no scroller clips, so name the ones past the bottom edge.
      const below = [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            el.getBoundingClientRect().bottom > se.clientHeight &&
            ['absolute', 'fixed'].includes(getComputedStyle(el).position),
        )
        .map(describe);
      add(2, `the page is ${se.scrollHeight}px tall in ${se.clientHeight}px: ${below.join(', ')}`);
    }
    for (const el of document.querySelectorAll('.ega-conv-stream')) {
      if (el.scrollWidth > el.clientWidth + 1)
        add(2, `the thread is ${el.scrollWidth}px wide in ${el.clientWidth}px`);
    }

    // 3. One action row per reply, at most 4 buttons + the pager's 2.
    for (const r of document.querySelectorAll('[data-ega-reply]')) {
      const buttons = [...r.querySelectorAll('button, [role=button]')].filter(
        (b) =>
          shown(b) &&
          b.closest('[data-ega-inspector]') === null &&
          !b.matches('[data-ega-meta-stop]'),
      );
      const rows = new Set(buttons.map((b) => Math.round((rect(b).top + rect(b).height / 2) / 8)));
      if (rows.size > 1) add(3, `${describe(r)} has buttons on ${rows.size} rows`);
      if (buttons.length > 6) add(3, `${describe(r)} shows ${buttons.length} buttons`);
    }

    // 4. The composer has at most 3 controls besides the textarea and an image's remove button.
    const composer = document.querySelector('[data-ega-composer]');
    if (composer) {
      const controls = [
        ...composer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'),
      ].filter(
        (el) =>
          shown(el) &&
          !el.matches('textarea, [data-ega-chip-remove]') &&
          el.getAttribute('tabindex') !== '-1' &&
          !(el as HTMLButtonElement).disabled,
      );
      if (controls.length > 3)
        add(4, `the composer has ${controls.length}: ${controls.map(describe).join(', ')}`);
    }

    // 6 and 7. Type from the scale (12 or 14), spacing from the scale, no uppercase, weights 400 and 600.
    const SIZES = new Set([12, 14]);
    const SPACE = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64]);
    const SIDES = ['top', 'right', 'bottom', 'left'];
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el) || !ours(el)) continue;
      const cs = getComputedStyle(el);
      if (ownText(el)) {
        if (!SIZES.has(px(cs.fontSize))) add(6, `${describe(el)} font-size ${cs.fontSize}`);
        if (cs.textTransform === 'uppercase') add(7, `${describe(el)} is uppercase`);
        const weight = Number(cs.fontWeight);
        if (el.closest('.ega-btn') === null && weight !== 400 && weight !== 600)
          add(7, `${describe(el)} font-weight ${cs.fontWeight}`);
      }
      // A stable scrollbar gutter is part of the gap the reader sees, so it counts with the padding beside it.
      const gutter =
        cs.scrollbarGutter.startsWith('stable') && el.scrollHeight > 0
          ? (el as HTMLElement).offsetWidth -
            el.clientWidth -
            px(cs.borderLeftWidth) -
            px(cs.borderRightWidth)
          : 0;
      for (const prop of ['row-gap', 'column-gap', ...SIDES.map((s) => `padding-${s}`)]) {
        const v = cs.getPropertyValue(prop);
        if (v === 'normal' || v === '') continue;
        const seen = px(v) + (prop === 'padding-right' ? gutter : 0);
        if (!SPACE.has(Math.round(seen * 100) / 100)) add(6, `${describe(el)} ${prop} ${v}`);
      }
      // getComputedStyle gives an auto margin's used width; the typed OM keeps the auto keyword.
      const typed = el.computedStyleMap();
      for (const side of SIDES) {
        const m = typed.get(`margin-${side}`);
        if (m instanceof CSSKeywordValue) continue;
        const v = Math.abs(px(cs.getPropertyValue(`margin-${side}`)));
        if (!SPACE.has(Math.round(v * 100) / 100)) add(6, `${describe(el)} margin-${side} ${v}px`);
      }
    }

    // 9. The meta line is one line: 12px at 1.5, plus 1.
    for (const m of document.querySelectorAll('[data-ega-reply-meta]')) {
      if (shown(m) && rect(m).height > 19)
        add(9, `${describe(m)} is ${Math.round(rect(m).height)}px tall`);
    }

    // 10. Targets.
    for (const el of document.querySelectorAll(
      'button, a[href], select, input:not([type=hidden]), [role=menuitem], [role=menuitemcheckbox], [role=radio], [role=option], [role=tab]',
    )) {
      // The meta line's Stop is a text button inside a one-line, 18px line (check 9); the spec keeps it there.
      if (!shown(el) || !ours(el) || el.matches('[data-ega-meta-stop]')) continue;
      const r = rect(el);
      const min = el.matches('[data-ega-send], [data-ega-add]') ? 32 : 28;
      if (r.width < min - 0.5 || r.height < min - 0.5)
        add(10, `${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)}, under ${min}`);
    }

    // 11. A control's name starts with the text it shows; "→" reads "to", punctuation does not count.
    const norm = (s: string): string =>
      s
        .replace(/→/g, ' to ')
        .replace(/[,.;:·…▸▾]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    for (const el of document.querySelectorAll(
      'button, a[href], [role=menuitem], [role=menuitemcheckbox], [role=tab], [role=radio], [role=option]',
    )) {
      if (!shown(el) || !ours(el)) continue;
      const seen = norm((el as HTMLElement).innerText);
      if (seen === '') continue;
      const labelledBy = el.getAttribute('aria-labelledby');
      const name =
        el.getAttribute('aria-label') ??
        (labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? '')
              .join(' ')
          : el.textContent);
      if (!norm(name).startsWith(seen))
        add(11, `${describe(el)} shows "${seen}" but is named "${norm(name)}"`);
    }
    return out;
  });
}

test('checks 1-4, 6, 7 and 9-12 on every state at 400, 320 and 256 (320 at 125%), light and dark', async () => {
  const findings = new Map<Check, string[]>(CHECKS.map((c) => [c, []]));
  test.setTimeout(900_000);
  for (const state of STATES) {
    const sp = await state.build();
    for (const theme of ['light', 'dark'] as const) {
      await applyTheme(sp, theme);
      for (const w of WIDTHS) {
        await sp.setViewportSize(w.viewport);
        await sp.waitForTimeout(80); // wait for layout and popover reposition (no observable end state)
        await state.ensure?.(sp);
        // Off every control: a hovered button's tooltip pseudo-element would count as its overflow.
        await sp.mouse.move(2, 380);
        const where = `${state.name}-${w.tag}-${theme}`;
        for (const f of await layoutFindings(sp)) {
          const check = CHECKS.find((c) => c.startsWith(`${f.check} `));
          if (check) findings.get(check)?.push(`${where}: ${f.what}`);
        }
        const axe = await new AxeBuilder({ page: sp }).withRules(['color-contrast']).analyze();
        for (const v of axe.violations) {
          for (const n of v.nodes) {
            findings
              .get('12 text contrast')
              ?.push(
                `${where}: ${n.target.join(' ')} ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`,
              );
          }
        }
      }
    }
    await sp.close();
    await state.after?.();
    await resetRoutes(ext.context);
    await openExampleTab(ext.context);
  }
  // One soft assertion per check: each fails on its own, naming the state, the element and the value.
  for (const check of CHECKS) {
    expect.soft([...new Set(findings.get(check))], `check ${check}`).toEqual([]);
  }
});

/** What has focus, named by its first data-ega attribute; "body" is the failure §8.5 rules out. */
async function focusOn(sp: Page): Promise<string> {
  return sp.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    if (a.id === 'sp-text') return 'textarea';
    const ega = [...a.attributes].find((x) => x.name.startsWith('data-ega-'));
    const value = ega && ega.value !== '' && ega.value !== 'true' ? `="${ega.value}"` : '';
    return ega ? `[${ega.name}${value}]` : a.tagName.toLowerCase();
  });
}

test('check 5 focus never lands on body after an action', async () => {
  test.setTimeout(240_000);
  mockAnthropic(ext.context, { translation: 'Hello there.' });
  const sp = await panelWith([
    { id: SITE, turns: TWO_PAIRS, updatedAt: T(20) },
    {
      id: `${SITE}#k1other1`,
      turns: [user('o1', 'otra conversación', T(300))],
      updatedAt: T(300),
    },
  ]);
  await sp.setViewportSize({ width: 400, height: 760 });
  const expectFocus = async (step: string, target: string | RegExp): Promise<void> => {
    await expect.poll(() => focusOn(sp), { message: step, timeout: 5_000 }).toMatch(target);
  };

  await sp.locator('#sp-text').fill('una más');
  await sp.locator('[data-ega-send]').click();
  await expectFocus('Send', 'textarea');
  await expect(newestReply(sp).locator('.ega-answer')).toContainText('Hello there.', {
    timeout: 10_000,
  });

  await newestReply(sp).locator('[data-ega-action="regenerate"]').click();
  await expectFocus('Regenerate', '[data-ega-reply]');
  await expect(newestReply(sp).locator('.ega-pager-count')).toHaveText('2/2', {
    timeout: 10_000,
  });

  await (await openReplyMenu(sp, 'refine')).locator('[data-ega-refine-preset="shorter"]').click();
  await expectFocus('a refine preset', '[data-ega-reply]');
  await expect(newestReply(sp).locator('.ega-pager-count')).toHaveText('3/3', {
    timeout: 10_000,
  });

  await (await openReplyMenu(sp, 'more')).locator('[data-ega-answer-again="explain"]').click();
  await expectFocus('Explain instead', '[data-ega-reply]');
  await expect(newestReply(sp).locator('.ega-pager-count')).toHaveText('4/4', {
    timeout: 10_000,
  });

  await (await openReplyMenu(sp, 'refine')).locator('[data-ega-translate-into-other]').click();
  const into = sp.getByRole('dialog', { name: 'Translate into' });
  await into.getByLabel('Language').selectOption('fr');
  await into.locator('[data-ega-translate-into-run]').click();
  await expectFocus('Translate into', '[data-ega-reply]');
  await expect(newestReply(sp).locator('.ega-pager-count')).toHaveText('5/5', {
    timeout: 10_000,
  });

  // Delete the first message: focus moves to the next message, and Undo puts it back on the restored one.
  const first = sp.locator('[data-ega-user-turn]').first();
  await first.hover();
  await first.locator('[data-ega-action="more"]').click();
  await sp.locator('[data-ega-delete]').click();
  await expectFocus('Delete message', '[data-ega-user-turn]');
  await sp.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first().click();
  await expectFocus('Undo of Delete message', '[data-ega-user-turn]');
  await expect(sp.locator('[data-ega-user-turn]').first()).toContainText('hola');

  await sp.locator('[data-ega-new-conversation]').click();
  await expectFocus('New conversation', 'textarea');
  await sp.locator('[data-sonner-toast] button', { hasText: 'Undo' }).first().click();
  await expectFocus('Undo of New conversation', 'textarea');

  // Popovers and menus close back onto their trigger, with Esc and with a click outside.
  // A key or click sent before the layer is up races the layer's own focus move.
  const openThen = async (trigger: string, layer: Locator): Promise<Locator> => {
    await sp.locator(trigger).click();
    await layer.waitFor({ state: 'visible' });
    return layer;
  };
  const triggers: { name: string; open: () => Promise<Locator>; trigger: string }[] = [
    {
      name: 'Refine menu',
      open: () => openReplyMenu(sp, 'refine'),
      trigger: '[data-ega-action="refine"]',
    },
    {
      name: 'reply More menu',
      open: () => openReplyMenu(sp, 'more'),
      trigger: '[data-ega-action="more"]',
    },
    {
      name: 'header More menu',
      open: () => openThen('[data-ega-header-more]', sp.getByRole('menu')),
      trigger: '[data-ega-header-more]',
    },
    {
      name: 'mode popover',
      open: () => openThen('[data-ega-mode-chip]', sp.locator('[data-ega-mode-popover]')),
      trigger: '[data-ega-mode-chip]',
    },
    {
      name: 'conversations',
      open: () => openThen('[data-ega-header-site]', sp.locator('[data-ega-conversations]')),
      trigger: '[data-ega-header-site]',
    },
    {
      name: 'backend popover',
      open: () => openThen('[data-ega-backend-chip]', sp.getByRole('dialog', { name: 'Backends' })),
      trigger: '[data-ega-backend-chip]',
    },
  ];
  // Click a point of the message box the settled layer leaves free: one over its middle would pick a menu item.
  const boxPoint = async (name: string): Promise<{ x: number; y: number }> => {
    const at = await sp.evaluate(() => {
      const field = document.querySelector<HTMLElement>('#sp-text');
      if (!field) return null;
      const r = field.getBoundingClientRect();
      for (const fx of [0.9, 0.75, 0.5, 0.25, 0.1]) {
        for (const fy of [0.5, 0.3, 0.7]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (document.elementFromPoint(x, y) === field) return { x, y };
        }
      }
      return null;
    });
    if (at === null) throw new Error(`${name}: an open layer covers the whole message box`);
    return at;
  };
  for (const t of triggers) {
    await t.open();
    await sp.keyboard.press('Escape');
    await expectFocus(`${t.name} closed with Esc`, t.trigger);
    await settle(await t.open(), t.name);
    const at = await boxPoint(t.name);
    await sp.mouse.click(at.x, at.y);
    await expectFocus(`${t.name} closed by a click on the message box`, 'textarea');
  }

  // Open another conversation, then delete one and bring it back.
  await sp.locator('[data-ega-header-site]').click();
  await sp.locator('[data-ega-conv-open]', { hasText: 'otra conversación' }).click();
  await expectFocus('open a conversation', 'textarea');
  await sp.locator('[data-ega-header-site]').click();
  const row = sp.locator(`[data-ega-conv-row="${SITE}"]`);
  await row.locator('[data-ega-conv-delete]').click();
  await expectFocus('delete a conversation', '[data-ega-conv-undo]');
  await row.locator('[data-ega-conv-undo]').click();
  await expectFocus('Undo of delete a conversation', '[data-ega-conv-open]');
  await sp.keyboard.press('Escape');

  // Stop: the next request hangs, so Send turns into Stop.
  const hang = (): void => undefined;
  await ext.context.route('https://api.anthropic.com/v1/messages', hang);
  await sp.locator('#sp-text').fill('una historia larga');
  await sp.locator('#sp-text').press('Enter');
  const stop = sp.locator('[data-ega-send]');
  await expect(stop).toHaveAccessibleName('Stop');
  await stop.click();
  await expectFocus('Stop', 'textarea');
  await ext.context.unroute('https://api.anthropic.com/v1/messages', hang);
  await sp.close();
});

// CI draws DejaVu Sans, 14-22% wider than Segoe UI: Verdana with a little letter-spacing covers the wide end (DejaVu where Verdana is missing).
test('an error row keeps one line at 256 in a font as wide as DejaVu Sans', async () => {
  test.setTimeout(120_000);
  const NET = { code: 'NETWORK', message: 'fetch failed', backendId: 'anthropic' };
  const AUTH = { code: 'AUTH', message: 'invalid x-api-key (401)', backendId: 'anthropic' };
  const sp = await panelWith([
    {
      id: SITE,
      turns: [
        user('u1', 'hola', T(9)),
        reply('a1', 'u1', T(9), { status: 'error', content: '', meta: null, error: AUTH }),
        user('u2', 'otra vez', T(6)),
        reply('a2', 'u2', T(6), {
          status: 'error',
          content: '',
          meta: null,
          error: NET,
          retries: 1,
        }),
        user('u3', 'una historia', T(3)),
        reply('a3', 'u3', T(3), {
          status: 'error',
          content: 'Once upon a time',
          meta: null,
          error: { code: 'PROTOCOL', message: 'stream closed', backendId: 'anthropic' },
        }),
      ],
    },
  ]);
  const ratio = await sp.evaluate(() => {
    const width = (font: string, spacing: string): number => {
      const s = document.createElement('span');
      s.style.font = `12px ${font}`;
      s.style.letterSpacing = spacing;
      s.textContent = 'Open settings Try again in 12 s';
      document.body.append(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    return (
      width('Verdana, "DejaVu Sans", sans-serif', '0.03em') /
      width('"Segoe UI", sans-serif', 'normal')
    );
  });
  test.info().annotations.push({ type: 'wide font / Segoe UI', description: ratio.toFixed(3) });
  // Only Windows has Segoe UI to compare with; elsewhere the stack is DejaVu Sans plus the spacing.
  if (process.platform === 'win32') {
    expect(ratio, 'the probe font is as wide as DejaVu Sans at its widest').toBeGreaterThanOrEqual(
      1.22,
    );
  }
  await sp.addStyleTag({
    content:
      'body, body * { font-family: Verdana, "DejaVu Sans", sans-serif !important; letter-spacing: 0.03em !important; }',
  });
  for (const size of [
    { width: 256, height: 608 },
    { width: 320, height: 760 },
  ]) {
    await sp.setViewportSize(size);
    await sp.waitForTimeout(80); // wait for layout (no observable end state)
    const rows = await sp.evaluate(() =>
      [...document.querySelectorAll('[data-ega-error] .ega-error-actions')].map((row) => {
        const tops = new Set(
          [...row.querySelectorAll('button')].map((b) => {
            const r = b.getBoundingClientRect();
            return Math.round((r.top + r.height / 2) / 8);
          }),
        );
        return { buttons: row.querySelectorAll('button').length, lines: tops.size };
      }),
    );
    expect(rows.length, `${size.width}: three error rows`).toBe(3);
    for (const [i, r] of rows.entries()) {
      expect.soft(r.lines, `${size.width}: error row ${i + 1} (${r.buttons} buttons)`).toBe(1);
    }
  }
  await sp.close();
});

// Spec §1.3/§5.2: the meta line shows whole words only, and its one control (Stop) keeps a whole focus ring.
test('the meta line cuts no word at 256, and Stop shows its whole ring', async () => {
  test.setTimeout(120_000);
  const sp = await openPanel(ext.context, ext.extensionId);
  await sp.addInitScript(() => {
    speechSynthesis.getVoices = () =>
      [
        { lang: 'en-US', localService: true, default: true, name: 'Test', voiceURI: 'test' },
      ] as unknown as SpeechSynthesisVoice[];
    speechSynthesis.speak = () => undefined;
  });
  await sp.emulateMedia({ reducedMotion: 'reduce' });
  await seedConversations(sp, [
    {
      id: SITE,
      turns: [
        user('u1', 'yalla bye habibi', T(9), {
          dispatch: { sourceLang: 'auto', targetLang: 'zh-TW', stream: true },
        }),
        reply('a1', 'u1', T(9), {
          content: '走吧，再見。',
          detectedLang: 'arabizi',
          detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }],
          meta: realMeta({ targetLang: 'zh-TW' }),
        }),
        user('u2', 'hola', T(5)),
        reply('a2', 'u2', T(5)),
      ],
    },
  ]);
  await reloadPanel(sp);
  await sp.setViewportSize({ width: 256, height: 608 });
  await sp.waitForTimeout(80); // wait for layout (no observable end state)
  const direction = sp
    .locator('[data-ega-reply]')
    .first()
    .locator('[data-ega-meta-item="direction"]');
  expect
    .soft(
      await direction.evaluate((el) => ({
        ellipsis:
          getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth,
        overflowsSideways: el.scrollWidth > el.clientWidth + 1,
      })),
      'the long direction is never cut sideways or ended with an ellipsis',
    )
    .toEqual({ ellipsis: false, overflowsSideways: false });
  const meta = sp.locator('[data-ega-reply]').first().locator('[data-ega-reply-meta]');
  expect((await meta.boundingBox())?.height ?? 99, 'still one line').toBeLessThanOrEqual(19);

  await sp.setViewportSize({ width: 400, height: 760 });
  const menu = await openReplyMenu(sp, 'more');
  await menu.locator('[data-ega-speak]').click();
  const stop = sp.locator('[data-ega-meta-stop]');
  await stop.waitFor({ state: 'visible' });
  await stop.focus();
  await sp.keyboard.press('Shift+Tab');
  await sp.keyboard.press('Tab');
  await expect(stop).toBeFocused();
  const fits = await stop.evaluate((el) => {
    const cs = getComputedStyle(el);
    const ring = Number.parseFloat(cs.outlineWidth) + Number.parseFloat(cs.outlineOffset);
    const b = el.getBoundingClientRect();
    const line = el.closest('[data-ega-reply-meta]')?.getBoundingClientRect();
    if (!line || cs.outlineStyle === 'none') return false;
    return (
      b.top - ring >= line.top - 0.5 &&
      b.bottom + ring <= line.bottom + 0.5 &&
      b.right + ring <= line.right + 0.5
    );
  });
  expect(fits, 'the Stop ring sits inside the line that clips it').toBe(true);
  await sp.close();
});

// A 320px panel at 125% zoom on a 768px laptop is about 256x480 CSS px: layers fit the space they open into, and scroll.
test('popovers and menus stay inside a short panel and scroll inside themselves', async () => {
  test.setTimeout(120_000);
  await seedCustomTasks(ext.context, ext.extensionId, [
    customTask({ id: 'c1', label: 'Tweet summary' }),
    customTask({ id: 'c2', label: 'Make it sound like a pirate captain, arr' }),
    customTask({ id: 'c3', label: 'Legal' }),
    customTask({ id: 'c4', label: 'Haiku' }),
    customTask({ id: 'c5', label: 'Release notes' }),
    customTask({ id: 'c6', label: 'Bug report' }),
  ]);
  try {
    const sp = await panelWith([{ id: SITE, turns: TWO_PAIRS }]);
    const inView = async (
      what: string,
      layer: Locator,
      size: { width: number; height: number },
    ) => {
      await settle(layer, `${what} at ${size.width}x${size.height}`);
      const box = await layer.boundingBox();
      if (box === null) throw new Error(`${what}: no box`);
      expect
        .soft(box.y, `${what} at ${size.width}x${size.height}: top edge`)
        .toBeGreaterThanOrEqual(0);
      expect
        .soft(box.y + box.height, `${what} at ${size.width}x${size.height}: bottom edge`)
        .toBeLessThanOrEqual(size.height);
    };
    for (const size of [
      { width: 256, height: 480 },
      { width: 256, height: 608 },
    ]) {
      await sp.setViewportSize(size);
      await sp.waitForTimeout(80); // wait for layout (no observable end state)
      await sp.locator('[data-ega-mode-chip]').click();
      const popover = sp.locator('[data-ega-mode-popover]');
      await popover.waitFor({ state: 'visible' });
      await inView('Next message popover', sp.getByRole('dialog', { name: 'Next message' }), size);
      // A custom task name may be 40 characters (CUSTOM_TASK_LABEL_MAX); its chip wraps, never spills.
      const spilled = await popover
        .locator('[data-ega-task]')
        .evaluateAll((chips) =>
          chips.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent.trim()),
        );
      expect.soft(spilled, `task chips at ${size.width}x${size.height}`).toEqual([]);
      await sp.keyboard.press('Escape');
      await popover.waitFor({ state: 'hidden' });
      const menu = await openReplyMenu(sp, 'more');
      await inView('the newest reply’s More menu', menu, size);
      await sp.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
    }
    await sp.close();
  } finally {
    await seedCustomTasks(ext.context, ext.extensionId, []);
  }
});

// Spec §1.10 and R15: a popover keeps the panel's 12px gutter, and its title and body text share one left edge.
test('the panel popovers keep the 12px gutter and one text edge', async () => {
  test.setTimeout(120_000);
  const sp = await panelWith([{ id: SITE, turns: FIRST_PAIR }]);
  const edges = (
    dialog: Locator,
    body: string,
  ): Promise<{ left: number; right: number; title: number; body: number }> =>
    dialog.evaluate((el, bodySel) => {
      const textLeft = (e: Element | null): number => {
        if (!e) return Number.NaN;
        const cs = getComputedStyle(e);
        return (
          e.getBoundingClientRect().left +
          Number.parseFloat(cs.paddingLeft) +
          Number.parseFloat(cs.borderLeftWidth)
        );
      };
      const box = el.getBoundingClientRect();
      return {
        left: box.left,
        right: window.innerWidth - box.right,
        title: textLeft(el.querySelector('.ega-popover-title')),
        body: textLeft(el.querySelector(bodySel)),
      };
    }, body);
  for (const size of [
    { width: 400, height: 760 },
    { width: 320, height: 760 },
    { width: 256, height: 608 },
  ]) {
    await sp.setViewportSize(size);
    await sp.waitForTimeout(80); // wait for layout (no observable end state)
    await sp.locator('[data-ega-backend-chip]').click();
    const backends = sp.getByRole('dialog', { name: 'Backends' });
    await backends.waitFor({ state: 'visible' });
    await settle(backends, `Backends at ${size.width}`);
    for (const body of ['.chain-help', '.chain-pos']) {
      const e = await edges(backends, body);
      const where = `Backends at ${size.width}, ${body}`;
      expect.soft(e.left, `${where}: left gutter`).toBeGreaterThanOrEqual(11.5);
      expect.soft(e.right, `${where}: right gutter`).toBeGreaterThanOrEqual(11.5);
      expect.soft(Math.abs(e.title - e.body), `${where}: one text edge`).toBeLessThanOrEqual(0.5);
    }
    await sp.keyboard.press('Escape');
    await backends.waitFor({ state: 'hidden' });
    await (await openReplyMenu(sp, 'refine')).locator('[data-ega-translate-into-other]').click();
    const into = sp.getByRole('dialog', { name: 'Translate into' });
    await into.waitFor({ state: 'visible' });
    await settle(into, `Translate into at ${size.width}`);
    const e = await edges(into, '.rm-into-label');
    const where = `Translate into at ${size.width}`;
    expect.soft(e.left, `${where}: left gutter`).toBeGreaterThanOrEqual(11.5);
    expect.soft(e.right, `${where}: right gutter`).toBeGreaterThanOrEqual(11.5);
    expect.soft(Math.abs(e.title - e.body), `${where}: one text edge`).toBeLessThanOrEqual(0.5);
    await sp.keyboard.press('Escape');
    await into.waitFor({ state: 'hidden' });
  }
  await sp.close();
});

// Spec §8.5: the last "Show earlier" removes itself; focus goes to the first message it showed, never to <body>.
test('Show earlier hands focus to the first message it shows', async () => {
  test.setTimeout(60_000);
  const turns: Record<string, unknown>[] = [];
  for (let i = 0; i < 35; i++) {
    turns.push(user(`u${i}`, `mensaje número ${i}`, T(200 - i)));
    turns.push(reply(`a${i}`, `u${i}`, T(200 - i), { content: `Message number ${i}.` }));
  }
  const sp = await panelWith([{ id: SITE, turns }]);
  const more = sp.locator('[data-ega-show-earlier]');
  await more.focus();
  await sp.keyboard.press('Enter');
  await expect(more).toHaveCount(0);
  await expect.poll(() => focusOn(sp)).toBe('[data-ega-user-turn]');
  expect(await sp.evaluate(() => document.activeElement?.getAttribute('data-turn-id'))).toBe('u0');
  await sp.close();
});

/** A CSS color as the browser computes it, so a token compares with a computed border. */
async function computedColor(sp: Page, value: string): Promise<string> {
  return sp.evaluate((v) => {
    const probe = document.createElement('span');
    probe.style.color = v;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, value);
}

// Spec §1.6/§1.7, §2.4 and §9.2: an open menu keeps its trigger in view and drawn as open, its keyboard item ringed, its edge off the panel's.
test('an open menu keeps its row, its trigger looks open, its keyboard item is ringed, it clears the edge', async () => {
  test.setTimeout(180_000);
  const sp = await panelWith([{ id: SITE, turns: TWO_PAIRS }]);
  const accent = await computedColor(sp, 'var(--color-accent)');
  const sizes = [
    { width: 400, height: 760 },
    { width: 320, height: 760 },
    { width: 256, height: 608 },
  ];
  for (const size of sizes) {
    await sp.setViewportSize(size);
    for (const which of ['refine', 'more'] as const) {
      const where = `${which} on the older reply at ${size.width}`;
      await sp.mouse.move(2, 2);
      // The older reply: its row is hidden until hover or focus, and the menu renders outside it.
      const older = sp.locator('[data-ega-reply]').first();
      const trigger = older.locator(`[data-ega-action="${which}"]`);
      await trigger.focus();
      await sp.keyboard.press('Enter');
      const menu = sp.getByRole('menu');
      await menu.waitFor({ state: 'visible' });
      await expect(menu.locator('[role^="menuitem"]').first(), where).toBeFocused();
      // Reduced motion still gives every style change a 0.01ms transition, so a read in the same frame sees the old value.
      await settle(menu, where);
      expect
        .soft(
          await older.locator('.ega-reply-actions').evaluate((el) => getComputedStyle(el).opacity),
          `${where}: the row of the open menu stays shown`,
        )
        .toBe('1');
      expect
        .soft(
          await trigger.evaluate((el) => getComputedStyle(el).borderTopColor),
          `${where}: the open trigger is drawn open`,
        )
        .toBe(accent);
      expect
        .soft(
          await menu
            .locator('[role^="menuitem"]')
            .first()
            .evaluate((el) => {
              const cs = getComputedStyle(el);
              return `${cs.outlineStyle} ${cs.outlineWidth}`;
            }),
          `${where}: the keyboard item has a ring`,
        )
        .toBe('solid 2px');
      const box = await menu.boundingBox();
      if (box === null) throw new Error(`${where}: menu has no box`);
      expect.soft(box.x, `${where}: left gap`).toBeGreaterThanOrEqual(11.5);
      expect
        .soft(size.width - (box.x + box.width), `${where}: right gap`)
        .toBeGreaterThanOrEqual(11.5);
      await sp.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
    }
  }
  // Pointer: the message toolbar stays while the pointer is in its own open menu.
  await sp.setViewportSize(sizes[0] as { width: number; height: number });
  const message = sp.locator('[data-ega-user-turn]').first();
  await message.hover();
  await message.locator('[data-ega-action="more"]').click();
  const menu = sp.getByRole('menu');
  await menu.waitFor({ state: 'visible' });
  await menu.locator('[data-ega-delete]').hover();
  expect
    .soft(
      await message
        .locator('[data-ega-user-toolbar]')
        .evaluate((el) => getComputedStyle(el).opacity),
      'the message toolbar stays shown under its open menu',
    )
    .toBe('1');
  await sp.keyboard.press('Escape');
  await sp.close();
});

test('check 8 nothing shifts when a toolbar or action row is revealed', async () => {
  test.setTimeout(120_000);
  const sp = await panelWith([{ id: SITE, turns: TWO_PAIRS }]);
  await sp.setViewportSize({ width: 400, height: 760 });
  const heights = (): Promise<number[]> =>
    sp.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-ega-user-turn], [data-ega-reply]')].map(
        (el) => el.offsetHeight,
      ),
    );
  await sp.mouse.move(0, 0);
  const atRest = await heights();
  for (const sel of ['[data-ega-user-turn]', '[data-ega-reply]']) {
    const count = await sp.locator(sel).count();
    for (let i = 0; i < count; i++) {
      const item = sp.locator(sel).nth(i);
      await item.hover();
      expect(await heights(), `hover on ${sel} ${i}`).toEqual(atRest);
      await item.locator('[data-ega-action="copy"]').focus();
      expect(await heights(), `focus inside ${sel} ${i}`).toEqual(atRest);
    }
  }
  await sp.close();
});
