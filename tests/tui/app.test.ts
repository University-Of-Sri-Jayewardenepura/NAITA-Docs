import { afterEach, expect, test } from 'bun:test';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { createDiaryApp } from '../../src/tui/app';
import { cliClient } from '../../src/tui/client';
import { fixture, PROFILE } from '../helpers/fixtures.mts';
import { loadDiary, loadProfile } from '../../src/diary/store.mts';

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
}, 15000);

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
