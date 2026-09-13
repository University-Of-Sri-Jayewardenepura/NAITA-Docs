import { afterEach, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, commit, git } from '../helpers/fixtures.mts';
import { gitHistory } from '../../src/git/history.mts';

let context;
afterEach(() => context?.cleanup());
it('imports an external repository by author calendar date, despite different committer dates', () => {
  context = fixture();
  const first = commit(context.repo, '2026-04-06T00:15:00+05:30', 'feat: add a search box', {
    committerDate: '2026-09-01T12:00:00Z',
    body: 'Supports titles.\n\nPreserve a multiline message.',
  });
  commit(context.repo, '2026-04-17T23:50:00-08:00', 'fix: clear search');
  commit(context.repo, '2026-04-18T00:00:00+05:30', 'Outside period');
  commit(context.repo, '2026-04-08T10:00:00+05:30', 'Colleague work', {
    authorName: 'Colleague',
    authorEmail: 'other@example.test',
  });
  const history = gitHistory([context.repo], '2026-04-06', '2026-04-17', 'trainee@example.test');
  expect(history.map((commit) => commit.date)).toEqual(['2026-04-06', '2026-04-17']);
  expect(history[0]).toMatchObject({
    hash: first,
    body: 'Supports titles.\n\nPreserve a multiline message.',
    repos: [context.repo],
  });
});
it('deduplicates shared commits across repositories and handles empty repositories', () => {
  context = fixture();
  expect(gitHistory([context.repo], '2026-04-01', '2026-04-30')).toEqual([]);
  commit(context.repo, '2026-04-06T12:00:00Z', 'Add a task');
  const clone = join(context.root, 'second repository');
  git(context.root, ['clone', '-q', context.repo, clone]);
  const history = gitHistory([context.repo, clone], '2026-04-01', '2026-04-30');
  expect(history).toHaveLength(1);
  expect(history[0].repos).toEqual([context.repo, clone]);
  const notRepo = join(context.root, 'not a repo');
  mkdirSync(notRepo);
  expect(() => gitHistory([notRepo], '2026-04-01', '2026-04-30')).toThrow(/Cannot read/);
});
