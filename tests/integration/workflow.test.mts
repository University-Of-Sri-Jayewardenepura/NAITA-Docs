import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, seedRepo, cli, screenshot, PROFILE } from '../helpers/fixtures.mts';
import { execute } from '../../src/cli/main.mts';
import { loadDiary, readJson, saveProfile, paths } from '../../src/diary/store.mts';
import { SECTIONS } from '../../src/diary/entries.mts';

let context;
afterEach(() => context?.cleanup());

it('can start with dates, add notes before import, and preserve CLI and manual edits on refresh', () => {
  context = fixture({ trainingStart: PROFILE.trainingStart, trainingEnd: PROFILE.trainingEnd });
  const { workspace, repo } = context;
  cli(workspace, 'add', { week: '2', section: 'learning', text: 'Learned how to reproduce a search issue.' });
  seedRepo(repo);
  cli(workspace, 'import', { repo, leave: '', medical: '' });
  cli(workspace, 'draft', { week: '1' });
  cli(workspace, 'accept', { week: '1', 'accept-drafts': true });
  let week = cli(workspace, 'show', { week: '1' });
  const last = week.entry.sections.work.at(-1).id;
  cli(workspace, 'add', {
    week: '1',
    section: 'work',
    before: last,
    text: 'Reviewed the empty state with my supervisor.',
  });
  week = cli(workspace, 'show', { week: '1' });
  expect(week.entry.sections.work[1].text).toContain('supervisor');
  const manual = readJson(week.file);
  manual.sections.work[0].text = 'Added a task search box so users can find a task by title.';
  writeFileSync(week.file, JSON.stringify(manual, null, 2));
  const before = readFileSync(week.file, 'utf8');
  cli(workspace, 'import', { repo });
  expect(readFileSync(week.file, 'utf8')).toBe(before);
  cli(workspace, 'draft', { week: '1' });
  week = cli(workspace, 'show', { week: '1' });
  expect(week.entry.sections.work).toEqual(manual.sections.work);
  expect(week.entry.suggestions.filter((item) => item.section === 'work')).toHaveLength(0);
  expect(cli(workspace, 'show', { week: '2' }).entry.sections.learning).toHaveLength(1);
  expect(existsSync(week.screenshotFolder)).toBe(true);
});

it('keeps a dry run read-only and refuses to guess absences in non-interactive mode', () => {
  context = fixture();
  seedRepo(context.repo);
  const location = paths(context.workspace);
  const before = readdirSync(location.local, { recursive: true });
  const result = cli(context.workspace, 'generate', { repo: context.repo, 'dry-run': true });
  expect(result.weeks).toHaveLength(2);
  expect(result.state.commits).toHaveLength(3);
  expect(readdirSync(location.local, { recursive: true })).toEqual(before);
  expect(existsSync(location.state)).toBe(false);
  expect(() => cli(context.workspace, 'generate', { repo: context.repo })).toThrow(/must be supplied/);
  expect(existsSync(location.state)).toBe(false);
});

it('reports section/day/screenshot gaps, then invalidates review after manual edits or image changes', async () => {
  context = fixture({ ...PROFILE, trainingEnd: '2026-04-06' });
  const options = { workspace: context.workspace };
  await execute('absence', { ...options, leave: '', medical: '' });
  let status = await execute('status', options);
  expect(status.weeks[0]).toMatchObject({ missingDays: ['2026-04-06'], percent: 0, reviewed: false });
  for (const section of Object.keys(SECTIONS))
    await execute('add', { ...options, week: '1', section, text: `My ${section} point.` });
  await execute('add', { ...options, week: '1', date: '2026-04-06', text: 'Set up the local project.' });
  const week = loadDiary(context.workspace).weeks[0];
  screenshot(week.screenshotFolder);
  status = await execute('status', options);
  expect(status.weeks[0]).toMatchObject({ percent: 100, complete: false });
  await execute('review', { ...options, week: '1' });
  expect((await execute('status', options)).complete).toBe(true);
  const edited = readJson(week.file);
  edited.sections.learning[0].text = 'Learned how the search filter works.';
  writeFileSync(week.file, JSON.stringify(edited));
  expect((await execute('status', options)).weeks[0].reviewed).toBe(false);
  await execute('review', { ...options, week: '1' });
  screenshot(week.screenshotFolder, '02-another.png');
  expect((await execute('status', options)).weeks[0].reviewed).toBe(false);
  await execute('review', { ...options, week: '1' });
  unlinkSync(join(week.screenshotFolder, '02-another.png'));
  expect((await execute('status', options)).weeks[0].reviewed).toBe(false);
  writeFileSync(join(week.screenshotFolder, '01-task-list.png'), 'broken image');
  status = await execute('status', options);
  expect(status.weeks[0].screenshots.errors).toHaveLength(1);
  expect(status.weeks[0].percent).toBeLessThan(100);
});

it('blocks work on leave dates and stale suggestions while preserving saved text', async () => {
  context = fixture();
  seedRepo(context.repo);
  const options = { workspace: context.workspace };
  await execute('import', { ...options, repo: context.repo, leave: '', medical: '' });
  await execute('draft', { ...options, week: '1' });
  await execute('absence', { ...options, leave: '2026-04-06' });
  const week = loadDiary(context.workspace).weeks[0];
  expect((await execute('status', options)).weeks[0].conflicts).toEqual(['2026-04-06']);
  await expect(execute('accept', { ...options, week: '1', id: week.entry.suggestions[0].id })).rejects.toThrow(
    /no longer/,
  );
  await expect(execute('add', { ...options, week: '1', date: '2026-04-06', text: 'Work.' })).rejects.toThrow(
    /work date/,
  );
});

it('adds daily notes alongside the existing Git description and lets the student edit it', async () => {
  context = fixture();
  seedRepo(context.repo);
  const options = { workspace: context.workspace };
  await execute('import', { ...options, repo: context.repo });
  await execute('add', {
    ...options,
    week: '1',
    date: '2026-04-06',
    text: 'Also reviewed feedback on the search box.',
  });
  const week = loadDiary(context.workspace).weeks[0];
  expect(week.entry.days['2026-04-06']).toHaveLength(2);
  await execute('edit', {
    ...options,
    week: '1',
    date: '2026-04-06',
    id: week.entry.days['2026-04-06'][0].id,
    text: 'Added a search box to help users find tasks.',
  });
  expect(loadDiary(context.workspace).weeks[0].entry.days['2026-04-06'][0].source).toBe('manual');
});

it('fails clearly on malformed manual files and prevents calendar changes from losing weeks', async () => {
  context = fixture();
  await execute('weeks', { workspace: context.workspace });
  expect(() => saveProfile(context.workspace, { ...PROFILE, trainingStart: '2026-04-07' })).toThrow(/separate|another/);
  const week = loadDiary(context.workspace).weeks[0];
  writeFileSync(week.file, '{bad json');
  await expect(execute('status', { workspace: context.workspace })).rejects.toThrow(/Cannot read/);
  expect(readFileSync(week.file, 'utf8')).toBe('{bad json');
});

it('imports reviewed agent proposals without changing existing notes and rejects partial invalid responses', async () => {
  context = fixture();
  seedRepo(context.repo);
  const options = { workspace: context.workspace };
  await execute('import', { ...options, repo: context.repo });
  await execute('add', { ...options, week: '1', section: 'work', text: 'My own wording.' });
  const diary = loadDiary(context.workspace);
  const file = join(context.root, 'response.json');
  const response = {
    weeks: [
      {
        monday: diary.weeks[0].monday,
        suggestions: [
          {
            section: 'work',
            kind: 'draft',
            text: 'Added a task search box.',
            reason: 'The commit describes this.',
            evidence: [diary.state.commits[0].hash],
          },
        ],
      },
    ],
  };
  writeFileSync(file, JSON.stringify(response));
  await execute('draft', { ...options, week: '1', from: file });
  expect(loadDiary(context.workspace).weeks[0].entry.sections.work[0].text).toBe('My own wording.');
  const saved = readFileSync(diary.weeks[0].file, 'utf8');
  response.weeks.push({ monday: '2030-01-01', suggestions: [] });
  writeFileSync(file, JSON.stringify(response));
  await expect(execute('draft', { ...options, from: file })).rejects.toThrow(/unknown/);
  expect(readFileSync(diary.weeks[0].file, 'utf8')).toBe(saved);
});
