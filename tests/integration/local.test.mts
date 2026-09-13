import { afterEach, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, PROFILE, ROOT, git, commit, screenshot, cli } from '../helpers/fixtures.mts';
import { execute } from '../../src/cli/main.mts';
import { loadDiary, paths } from '../../src/diary/store.mts';
import { readHistory } from '../../src/diary/history.mts';

let context;
afterEach(() => context?.cleanup());

it('initializes all weekly screenshot folders and keeps the entire local workspace ignored', async () => {
  context = fixture();
  const workspace = join(context.root, 'new student');
  await execute('init', { workspace, from: join(ROOT, 'docs/examples/profile.json') });
  const location = paths(workspace);
  const diary = loadDiary(workspace);
  expect(diary.weeks).toHaveLength(2);
  for (const week of diary.weeks) {
    expect(existsSync(week.file)).toBe(true);
    expect(existsSync(week.screenshotFolder)).toBe(true);
    expect(week.file.startsWith(location.local)).toBe(true);
  }
  expect(existsSync(location.output)).toBe(true);
  expect(existsSync(location.journal)).toBe(true);
  expect(existsSync(join(workspace, 'naita-diary.json'))).toBe(false);
  expect(existsSync(join(workspace, 'diary'))).toBe(false);
  git(workspace, ['init', '-q']);
  expect(git(workspace, ['status', '--porcelain', '--untracked-files=all'])).toBe('');
  const before = readFileSync(diary.weeks[0].file);
  await execute('init', { workspace, from: join(ROOT, 'docs/examples/profile.json') });
  expect(readFileSync(diary.weeks[0].file)).toEqual(before);
});

it('reuses multiple cached repositories offline and journals manual insert/edit/remove operations', async () => {
  context = fixture();
  const { workspace, repo } = context;
  const options = { workspace };
  const first = commit(repo, '2026-04-06T10:00:00Z', 'Add search');
  const secondRepo = join(context.root, 'backend');
  git(context.root, ['clone', '-q', repo, secondRepo]);
  const second = commit(secondRepo, '2026-04-07T10:00:00Z', 'Add filtering');
  await execute('import', { ...options, repo, leave: '', medical: '' });
  // Adding a source works without the previous repository being accessible.
  renameSync(repo, `${repo}-offline`);
  await execute('import', { ...options, repo: secondRepo });
  expect(loadDiary(workspace).state.repos).toEqual([repo, secondRepo]);
  expect(loadDiary(workspace).state.commits.map((item) => item.hash)).toEqual([first, second]);
  expect(loadDiary(workspace).state.commits[0].repos).toEqual([repo, secondRepo]);
  const beforeFailedImport = readFileSync(paths(workspace).state);
  await expect(execute('import', { ...options, repo: secondRepo, author: 'Someone else' })).rejects.toThrow(
    /all saved/,
  );
  expect(readFileSync(paths(workspace).state)).toEqual(beforeFailedImport);
  await execute('draft', options);
  await execute('accept', { ...options, week: '1', 'accept-drafts': true });
  const last = loadDiary(workspace).weeks[0].entry.sections.work.at(-1).id;
  await execute('add', {
    ...options,
    week: '1',
    section: 'work',
    before: last,
    text: 'Discussed feedback with my supervisor.',
    actor: 'codex',
    reason: 'Student supplied this activity.',
  });
  let week = loadDiary(workspace).weeks[0];
  const manual = week.entry.sections.work[1];
  expect(manual.source).toBe('manual');
  expect(manual.evidence).toEqual([]);
  const insertion = readHistory(workspace).find((event) => event.action === 'add');
  expect(insertion).toMatchObject({
    actor: 'codex',
    reason: 'Student supplied this activity.',
    target: { before: last },
  });
  expect(insertion.changes[0].after.value.sections.work[1].text).toBe(manual.text);
  // A subsequent refresh adds evidence without discarding or reordering notes.
  const third = commit(secondRepo, '2026-04-08T10:00:00Z', 'Check empty inputs');
  await execute('import', { ...options, repo: secondRepo });
  expect(loadDiary(workspace).state.commits.map((item) => item.hash)).toEqual([first, second, third]);
  expect(loadDiary(workspace).weeks[0].entry.sections.work).toEqual(week.entry.sections.work);
  await execute('edit', {
    ...options,
    week: '1',
    section: 'work',
    id: manual.id,
    text: 'Reviewed supervisor feedback.',
  });
  await execute('edit', { ...options, week: '1', section: 'work', id: manual.id, remove: true });
  const removed = readHistory(workspace)
    .filter((event) => event.action === 'edit')
    .at(-1);
  expect(removed.changes[0].before.value.sections.work[1].text).toBe('Reviewed supervisor feedback.');
  expect(removed.changes[0].after.value.sections.work.some((item) => item.id === manual.id)).toBe(false);
  renameSync(secondRepo, `${secondRepo}-offline`);
  week = loadDiary(workspace).weeks[0];
  week.entry.sections.work[0].text = 'Manually clarified the search work.';
  writeFileSync(week.file, JSON.stringify(week.entry));
  screenshot(week.screenshotFolder);
  const journalBeforeDryRun = readFileSync(paths(workspace).journal);
  await execute('generate', { ...options, 'dry-run': true });
  expect(readFileSync(paths(workspace).journal)).toEqual(journalBeforeDryRun);
  // history/show/status also checkpoint changes made in an external editor.
  const history = cli(workspace, 'history', { week: '1' });
  const external = history.events.find(
    (event) => event.action === 'external-edit' && event.changes.some((change) => change.path.startsWith('weeks/')),
  );
  expect(external.changes.find((change) => change.path.startsWith('weeks/')).after.value.sections.work[0].text).toBe(
    'Manually clarified the search work.',
  );
  cpSync(join(week.screenshotFolder, '01-task-list.png'), join(week.screenshotFolder, '02-feedback.png'));
  const imageEvent = (await execute('history', { ...options, week: '1' })).events.at(-1);
  expect(imageEvent.action).toBe('external-edit');
  expect(imageEvent.changes).toHaveLength(1);
  expect(imageEvent.changes[0]).toMatchObject({
    path: 'screenshots/week-01-2026-04-06/02-feedback.png',
    before: null,
    after: { kind: 'file', sha256: expect.any(String) },
  });
  await execute('draft', options);
  const result = await execute('generate', options);
  expect(result.path).toBe(join(paths(workspace).output, 'NAITA-Daily-Diary.pdf'));
  expect(existsSync(result.path)).toBe(true);
  expect(readHistory(workspace).at(-1)).toMatchObject({ action: 'generate', output: { path: result.path } });
});

it('copies legacy profiles, cached history, notes, screenshots and PDFs without altering the old files', async () => {
  context = fixture();
  await execute('init', { workspace: context.workspace, from: join(ROOT, 'docs/examples/profile.json') });
  await execute('add', { workspace: context.workspace, week: '1', section: 'work', text: 'Legacy student note.' });
  const week = loadDiary(context.workspace).weeks[0];
  screenshot(week.screenshotFolder);
  const legacy = join(context.root, 'legacy student');
  const current = paths(context.workspace);
  mkdirSync(join(legacy, 'diary'), { recursive: true });
  cpSync(current.profile, join(legacy, 'naita-diary.json'));
  cpSync(current.state, join(legacy, 'diary/state.json'));
  cpSync(current.weeks, join(legacy, 'diary/weeks'), { recursive: true });
  cpSync(current.screenshots, join(legacy, 'diary/screenshots'), { recursive: true });
  mkdirSync(join(legacy, 'output'));
  writeFileSync(join(legacy, 'output/previous.pdf'), 'legacy output fixture');
  const source = readFileSync(join(legacy, 'naita-diary.json'));
  expect((await execute('generate', { workspace: legacy, 'dry-run': true })).config.name).toBe(PROFILE.name);
  expect(existsSync(paths(legacy).local)).toBe(false);
  await execute('status', { workspace: legacy });
  const migrated = loadDiary(legacy).weeks[0];
  expect(migrated.entry.sections.work[0].text).toBe('Legacy student note.');
  expect(readFileSync(join(migrated.screenshotFolder, '01-task-list.png'))).toEqual(
    readFileSync(join(week.screenshotFolder, '01-task-list.png')),
  );
  expect(readFileSync(join(paths(legacy).output, 'previous.pdf'), 'utf8')).toBe('legacy output fixture');
  expect(readFileSync(join(legacy, 'naita-diary.json'))).toEqual(source);
  expect(readHistory(legacy)[0].action).toBe('migration');
  await execute('profile', { workspace: legacy, field: 'name', text: 'Updated locally' });
  await execute('status', { workspace: legacy });
  expect(loadDiary(legacy).config.name).toBe('Updated locally');
  expect(readFileSync(join(legacy, 'naita-diary.json'))).toEqual(source);
});

it('refuses to overwrite diary data when the change log is damaged', async () => {
  context = fixture();
  const options = { workspace: context.workspace };
  await execute('add', { ...options, week: '1', section: 'work', text: 'Keep this student note.' });
  const week = loadDiary(context.workspace).weeks[0];
  const location = paths(context.workspace);
  const before = readFileSync(week.file);
  const journal = readFileSync(location.journal, 'utf8');
  for (const damaged of ['{"unfinished":', '{"schemaVersion":1,"changes":[{}]}\n']) {
    writeFileSync(location.journal, journal + damaged);
    await expect(execute('add', { ...options, week: '1', section: 'work', text: 'Another note.' })).rejects.toThrow(
      /Cannot read history event/,
    );
    expect(readFileSync(week.file)).toEqual(before);
    expect(readFileSync(location.journal, 'utf8')).toBe(journal + damaged);
  }
  writeFileSync(location.journal, journal);
  await execute('add', { ...options, week: '1', section: 'work', text: 'Another note.' });
  expect(loadDiary(context.workspace).weeks[0].entry.sections.work).toHaveLength(2);
});
