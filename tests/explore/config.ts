export const CONFIG = {
  model: { plan: 'claude-sonnet-4-6', replay: 'claude-haiku-4-5-20251001' },
  stepBudget: Number(process.env['EGA_EXPLORE_STEPS'] ?? 200),
  budgetUsd: Number(process.env['EGA_EXPLORE_BUDGET_USD'] ?? 1),
  antiLoopWindow: 5,
  antiLoopThreshold: 3,
  replayRolls: 3,
  surfaces: ['popup', 'sidepanel', 'options', 'tooltip', 'page'] as const,
} as const;
