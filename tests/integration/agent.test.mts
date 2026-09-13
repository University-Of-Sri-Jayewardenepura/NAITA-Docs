import { afterEach, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fixture, seedRepo, ROOT, cli } from '../helpers/fixtures.mts';
import { execute } from '../../src/cli/main.mts';
import { loadDiary, saveWeek } from '../../src/diary/store.mts';
import { draftWeeks } from '../../src/diary/workflow.mts';
import { agentPrompt } from '../../src/ai/prompt.mts';
import { runAgent } from '../../src/ai/runner.mts';
import { run } from '../../src/runtime/process.mts';

let context;
afterEach(() => context?.cleanup());

it('passes evidence on stdin, imports proposals, and preserves edits made while the agent runs', async () => {
  context = fixture();
  seedRepo(context.repo);
  await execute('import', { workspace: context.workspace, repo: context.repo });
  await execute('add', { workspace: context.workspace, week: '1', section: 'work', text: 'Original student note.' });
  // The adapter is executed from the workspace. Quote fixed fixture paths as
  // shell arguments; no diary content is ever interpolated into the command.
  const quote = (value) => (process.platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`);
  const command = `${quote(process.execPath)} ${quote(resolve(ROOT, 'tests/fixtures/mock-agent.mts'))}`;
  const pending = draftWeeks(context.workspace, { week: '1', 'agent-command': command });
  const week = loadDiary(context.workspace).weeks[0];
  week.entry.sections.work[0].text = 'Student changed this while waiting for the agent.';
  saveWeek(context.workspace, week);
  await pending;
  const latest = loadDiary(context.workspace).weeks[0];
  expect(latest.entry.sections.work[0].text).toBe('Student changed this while waiting for the agent.');
  expect(latest.entry.suggestions[0].text).toBe('Added a task search box.');
  const throughBun = cli(context.workspace, 'draft', { week: '1', 'agent-command': command });
  expect(throughBun.weeks[0].suggestions[0].text).toBe('Added a task search box.');
});

it('reports non-zero exits and malformed JSON without altering the diary', async () => {
  context = fixture();
  seedRepo(context.repo);
  await execute('import', { workspace: context.workspace, repo: context.repo });
  const diary = loadDiary(context.workspace);
  const before = readFileSync(diary.weeks[0].file, 'utf8');
  const prompt = agentPrompt(diary.weeks);
  await expect(
    runAgent({ 'agent-command': 'bun run tests/fixtures/mock-agent.mts fail' }, prompt, ROOT),
  ).rejects.toThrow(/Deliberate/);
  await expect(
    runAgent({ 'agent-command': 'bun run tests/fixtures/mock-agent.mts malformed' }, prompt, ROOT),
  ).rejects.toThrow(/JSON/);
  expect(readFileSync(diary.weeks[0].file, 'utf8')).toBe(before);
});

it('reports a missing subprocess without an unhandled error or hanging', async () => {
  const result = await run(['naita-test-nonexistent-executable'], ROOT, 'test input', 1000);
  expect(result.success).toBe(false);
  expect(result.stderr).toMatch(/ENOENT/);
});
