import fs from 'node:fs/promises';
import path from 'node:path';

export interface LoadedGoal {
  id: string;
  body: string;
}

export async function loadGoal(goalId: string): Promise<LoadedGoal> {
  const file = path.resolve('tests/explore/goals', `${goalId}.md`);
  const body = await fs.readFile(file, 'utf-8');
  return { id: goalId, body };
}
