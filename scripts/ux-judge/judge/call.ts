// `system` goes in as blocks, not a string — only the block shape carries `cache_control`.
import Anthropic from '@anthropic-ai/sdk';
import type { JudgeMode } from '../config';
import { CONFIG } from '../config';
import type { JudgePrompt } from './prompt';
import { parseJudgeVerdict, type JudgeVerdict } from './parse';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  return client;
}

export async function callJudge(prompt: JudgePrompt, mode: JudgeMode): Promise<JudgeVerdict> {
  const model = CONFIG.judgeModel[mode];
  const c = getClient();
  const resp = await c.messages.create({
    model,
    max_tokens: CONFIG.maxTokens,
    system: prompt.system.map((b) => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cache_control ? { cache_control: b.cache_control } : {}),
    })),
    messages: [
      { role: 'user', content: typeof prompt.user === 'string' ? prompt.user : [...prompt.user] },
    ],
  });
  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return parseJudgeVerdict(text);
}
