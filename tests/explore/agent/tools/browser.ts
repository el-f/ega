import type { Page, BrowserContext } from '@playwright/test';

export const BROWSER_TOOL_DEFS = [
  {
    name: 'browser_click',
    description: 'Click an element by selector, or by ARIA role + accessible name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string' as const },
        role: { type: 'string' as const },
        name: { type: 'string' as const },
      },
      required: [] as string[],
    },
  },
  {
    name: 'browser_type',
    description: 'Fill an input identified by selector with the given value.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string' as const },
        value: { type: 'string' as const },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser_wait',
    description: 'Wait for a selector to appear (5s cap) or a timeout (capped at 5s).',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: { type: 'string' as const },
        ms: { type: 'number' as const },
      },
      required: [] as string[],
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Return a minified DOM snapshot of the active page (capped at 8KB).',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the active page to a URL (file:// or http://).',
    input_schema: {
      type: 'object' as const,
      properties: { url: { type: 'string' as const } },
      required: ['url'],
    },
  },
] as const;

export interface BrowserContextRef {
  context: BrowserContext;
  page: Page;
}

export type ToolDispatchResult = { ok: true; result: string } | { ok: false; error: string };

// The ARIA roles the agent may query.
const ALLOWED_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'tab',
  'menuitem',
  'option',
  'heading',
  'dialog',
  'switch',
  'listbox',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export async function dispatchBrowserTool(
  ref: BrowserContextRef,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolDispatchResult> {
  try {
    switch (toolName) {
      case 'browser_click': {
        const role = asString(input['role']);
        const name = asString(input['name']);
        const selector = asString(input['selector']);
        if (role && ALLOWED_ROLES.has(role)) {
          const locator =
            name === undefined
              ? ref.page.getByRole(role as Parameters<Page['getByRole']>[0])
              : ref.page.getByRole(role as Parameters<Page['getByRole']>[0], { name });
          await locator.click();
          return { ok: true, result: 'clicked' };
        }
        if (selector === undefined) {
          return { ok: false, error: 'browser_click requires selector or supported role+name' };
        }
        await ref.page.click(selector);
        return { ok: true, result: 'clicked' };
      }
      case 'browser_type': {
        const selector = asString(input['selector']);
        const value = asString(input['value']);
        if (selector === undefined || value === undefined) {
          return { ok: false, error: 'browser_type requires selector + value' };
        }
        await ref.page.fill(selector, value);
        return { ok: true, result: 'typed' };
      }
      case 'browser_wait': {
        const selector = asString(input['selector']);
        const ms = asNumber(input['ms']);
        if (selector !== undefined) {
          await ref.page.waitForSelector(selector, { timeout: 5_000 });
        } else if (ms !== undefined) {
          await ref.page.waitForTimeout(Math.min(ms, 5_000));
        } else {
          return { ok: false, error: 'browser_wait requires selector or ms' };
        }
        return { ok: true, result: 'waited' };
      }
      case 'browser_snapshot': {
        const html = await ref.page.evaluate(() => {
          const clone = document.documentElement.cloneNode(true) as HTMLElement;
          for (const n of clone.querySelectorAll('script, style, noscript')) n.remove();
          return clone.outerHTML.slice(0, 8_000);
        });
        return { ok: true, result: html };
      }
      case 'browser_navigate': {
        const url = asString(input['url']);
        if (url === undefined) return { ok: false, error: 'browser_navigate requires url' };
        await ref.page.goto(url);
        return { ok: true, result: 'navigated' };
      }
      default:
        return { ok: false, error: `unknown browser tool ${toolName}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
