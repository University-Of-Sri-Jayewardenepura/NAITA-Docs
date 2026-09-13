import { afterEach, expect, test } from 'bun:test';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { createDiaryApp } from '../../src/tui/app';
import { cliClient } from '../../src/tui/client';
import { fixture, PROFILE, seedRepo } from '../helpers/fixtures.mts';
import { loadDiary, loadProfile } from '../../src/diary/store.mts';
import { execute } from '../../src/cli/main.mts';

let setup: TestRendererSetup;
let context: ReturnType<typeof fixture>;
afterEach(() => {
  setup?.renderer.destroy();
  context?.cleanup();
});

async function frameContaining(text: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (frame.includes(text)) return frame;
    await new Promise((accept) => setTimeout(accept, 20));
  }
  throw new Error(`Frame did not contain ${text}:\n${setup.captureCharFrame()}`);
}

test('edits a profile and a weekly point through real keyboard events and CLI persistence', async () => {
  context = fixture({ ...PROFILE, name: '' });
  setup = await createTestRenderer({ width: 100, height: 30 });
  const app = createDiaryApp(setup.renderer, cliClient(context.workspace));
  await app.start();
  await frameContaining('Choose any step');
  setup.mockInput.pressEnter();
  await frameContaining('Select any field');
  setup.mockInput.pressEnter();
  await frameContaining('Student name (1/1)');
  await setup.mockInput.typeText('Test Student', 1);
  setup.mockInput.pressEnter();
  await frameContaining('Select any field');
  expect(loadProfile(context.workspace).name).toBe('Test Student');
  setup.mockInput.pressEscape();
  await frameContaining('Choose any step');
  setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  await frameContaining('Choose a week');
  setup.mockInput.pressEnter();
  await frameContaining('Work carried out (0 points)');
  setup.mockInput.pressEnter();
  await frameContaining('Each entry is a bullet point');
  setup.mockInput.pressEnter();
  await frameContaining('Add a point (1/1)');
  await setup.mockInput.pasteBracketedText('Added a search box to help users find a task.');
  setup.mockInput.pressEnter();
  await frameContaining('Each entry is a bullet point');
  expect(loadDiary(context.workspace).weeks[0].entry.sections.work[0].text).toBe(
    'Added a search box to help users find a task.',
  );
  setup.resize(80, 24);
  await setup.renderOnce();
  expect(setup.captureCharFrame()).toContain('Esc: back');
  setup.mockInput.pressEscape();
  await frameContaining('Work carried out (1 points)');
  setup.mockInput.pressCtrlC();
  expect(setup.renderer.isDestroyed).toBe(true);
}, 30000);

test('shows validation errors and allows Escape out of a form without saving', async () => {
  context = fixture();
  setup = await createTestRenderer({ width: 90, height: 28 });
  const app = createDiaryApp(setup.renderer, cliClient(context.workspace));
  await app.start();
  setup.mockInput.pressArrow('down');
  setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  await frameContaining('Path to the Git repository');
  setup.mockInput.pressEnter();
  await frameContaining('is required');
  await setup.mockInput.typeText('/not-a-repository', 1);
  setup.mockInput.pressEnter();
  await frameContaining('Your Git author name');
  setup.mockInput.pressEscape();
  await frameContaining('Path to the Git repository');
  expect(setup.captureCharFrame()).toContain('/not-a-repository');
  setup.mockInput.pressEscape();
  await frameContaining('Choose any step');
  expect(loadDiary(context.workspace).state.repos).toEqual([]);
}, 15000);

test('opens the screenshots-last checklist and a week-specific capture idea with real keyboard events', async () => {
  context = fixture();
  seedRepo(context.repo);
  await execute('import', { workspace: context.workspace, repo: context.repo });
  setup = await createTestRenderer({ width: 110, height: 32 });
  const app = createDiaryApp(setup.renderer, cliClient(context.workspace));
  await app.start();
  for (let index = 0; index < 4; index++) setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  await frameContaining('Checklist | screenshots last');
  expect(setup.captureCharFrame()).toContain('CHECKLIST.md');
  // Seven overall tasks precede the weekly capture guides.
  for (let index = 0; index < 7; index++) setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  await frameContaining('Week 1 | Screenshot checklist');
  expect(setup.captureCharFrame()).toContain('week-01-2026-04-06');
  // Ten weekly tasks precede optional evidence-based capture ideas.
  for (let index = 0; index < 10; index++) setup.mockInput.pressArrow('down');
  setup.mockInput.pressEnter();
  await frameContaining('What to capture (optional)');
  expect(setup.captureCharFrame()).toContain('search/filter input');
  expect(setup.captureCharFrame()).toContain('Suggested filename:');
  setup.mockInput.pressEscape();
  await frameContaining('Week 1 | Screenshot checklist');
}, 30000);
