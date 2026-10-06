import { describe, it, expect } from 'vitest';
import { modelDisplayName } from '@/shared/model-names';

// Side panel spec 5.6: the table every surface's meta line and About this reply read.
describe('modelDisplayName', () => {
  it.each([
    ['claude-haiku-4-5', 'Claude Haiku 4.5'],
    ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5'],
    ['claude-sonnet-4-5', 'Claude Sonnet 4.5'],
    ['claude-opus-4-1', 'Claude Opus 4.1'],
    ['claude-sonnet-4', 'Claude Sonnet 4'],
    ['claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet'],
    ['claude-3-haiku-20240307', 'Claude 3 Haiku'],
    ['gpt-4o-mini', 'GPT-4o mini'],
    ['gpt-4.1', 'GPT-4.1'],
    ['gpt-4.1-mini', 'GPT-4.1 mini'],
    ['gpt-4o-2024-08-06', 'GPT-4o'],
    ['o4-mini', 'o4-mini'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
    ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
    ['anthropic/claude-sonnet-4-5', 'Claude Sonnet 4.5'],
    ['openai/gpt-4o-latest', 'GPT-4o'],
    ['llama3.2:3b', 'llama3.2:3b'],
    ['deepseek-chat', 'deepseek-chat'],
  ])('%s reads %s', (raw, shown) => {
    expect(modelDisplayName(raw)).toBe(shown);
  });
});
