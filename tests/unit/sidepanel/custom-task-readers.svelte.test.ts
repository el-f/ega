// @vitest-environment jsdom
// A custom task's turn runs under kind translate with its own taskId; every reader names it from that id.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import { turnTaskValue, buildStartArgs, type Turn } from '@/sidepanel/state/conversation';
import { exportMarkdown } from '@/sidepanel/state/conversation-export';
import { materializeTasks, notesLabel, type TaskView } from '@/shared/task-view';
import { taskGerund } from '@/shared/task-prompts';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { CustomTask } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';
import { sel } from '@tests/_helpers/lang';
import {
  cachedCustomTasks,
  ensureCustomTasks,
  installCustomLanguagesInvalidator,
  resetCustomLanguagesCache,
} from '@/content/customs-cache';
import { STORAGE_KEYS } from '@/shared/constants';
import { chromeMock } from '@tests/mocks/chrome';

const tweet: CustomTask = {
  id: 'c-tweet',
  label: 'Tweet summary',
  system: 'Summarize as one tweet in a {{tone}} voice.',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  createdAt: 1,
} as CustomTask;

const views: TaskView[] = materializeTasks({ ...DEFAULT_SETTINGS } as Settings, [tweet]);

const userTurn: Turn = {
  id: 'u1',
  role: 'user',
  kind: 'translate',
  taskId: 'c-tweet',
  status: 'idle',
  content: 'long text',
  createdAt: 1,
  tone: 'formal',
  dispatch: { sourceLang: sel('en'), targetLang: sel('en'), stream: false },
};
const assistantTurn: Turn = {
  id: 'a1',
  role: 'assistant',
  kind: 'translate',
  taskId: 'c-tweet',
  status: 'done',
  content: 'short',
  attachedToTurnId: 'u1',
  createdAt: 2,
};

describe('a custom-task turn', () => {
  it('turnTaskValue reads the taskId, and the request carries it', () => {
    expect(turnTaskValue(userTurn)).toBe('c-tweet');
    const args = buildStartArgs(userTurn, {
      requestId: 'r',
      reuse: { sourceLang: sel('en'), targetLang: sel('en'), stream: false },
      thread: 'none',
    });
    expect(args.task).toBe('c-tweet');
    expect(args.explain).toBe(false);
  });

  it('the user turn shows the task name with its tone, and the export names it', () => {
    const { container } = render(UserTurn, { props: { turn: userTurn, taskViews: views } });
    expect(container.textContent).toContain('Tweet summary · Formal');
    expect(exportMarkdown([userTurn], views)).toContain('**You (Tweet summary):**');
  });

  it('a deleted task reads "Deleted task"', () => {
    const builtInsOnly = materializeTasks({ ...DEFAULT_SETTINGS } as Settings, []);
    expect(exportMarkdown([userTurn], builtInsOnly)).toContain('**You (Deleted task):**');
  });

  it('Re-run lists the custom task, and a deleted one only as a disabled option', () => {
    const select = (taskViews: TaskView[]) =>
      [
        ...(render(AssistantTurn, {
          props: {
            turn: assistantTurn,
            isLatest: true,
            onRetry: vi.fn(),
            onTaskSwitch: vi.fn(),
            onSwap: vi.fn(),
            canRetry: true,
            taskViews,
          },
        })
          .container.querySelector('[data-ega-task-switch]')
          ?.querySelectorAll('option') ?? []),
      ].map((o) => [o.value, o.textContent.trim(), o.disabled]);
    expect(select(views)).toContainEqual(['c-tweet', 'Tweet summary', false]);
    const gone = select(materializeTasks({ ...DEFAULT_SETTINGS } as Settings, []));
    expect(gone).toContainEqual(['c-tweet', 'Deleted task', true]);
  });

  it.each([
    [assistantTurn, false],
    [{ ...assistantTurn, taskId: undefined }, true],
  ] as const)('refine chips: custom task %#', (turn, shown) => {
    const { container } = render(AssistantTurn, {
      props: {
        turn: turn as Turn,
        isLatest: true,
        onRetry: vi.fn(),
        onRefine: vi.fn(),
        taskViews: views,
      },
    });
    expect(container.querySelector('[data-ega-quick-refine]') !== null).toBe(shown);
  });
});

describe('labels for any task id', () => {
  it('a custom task loads as "Working" and its notes are "Notes"', () => {
    expect(taskGerund('c-tweet')).toBe('Working');
    expect(taskGerund('summarize')).toBe('Summarizing');
    expect(notesLabel('explain')).toBe('Context & subtext');
    expect(notesLabel('grammar')).toBe('Notes');
  });
});

describe('content cache of custom tasks', () => {
  beforeEach(() => {
    resetCustomLanguagesCache();
  });

  it('drops the cached rows when ega.customTasks changes', async () => {
    installCustomLanguagesInvalidator();
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: [tweet] });
    expect((await ensureCustomTasks()).map((t) => t.id)).toEqual(['c-tweet']);
    expect(cachedCustomTasks()).toHaveLength(1);
    await chrome.storage.local.set({ [STORAGE_KEYS.customTasks]: [] });
    chromeMock.storage.local._fire({
      [STORAGE_KEYS.customTasks]: { oldValue: [tweet], newValue: [] },
    });
    expect(cachedCustomTasks()).toEqual([]);
    expect(await ensureCustomTasks()).toEqual([]);
  });
});
