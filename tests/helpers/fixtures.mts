import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { saveProfile } from '../../src/diary/store.mts';

export const ROOT = resolve(import.meta.dirname, '../..');
export const PROFILE = {
  name: 'Sample Trainee',
  privateAddress: '12 Sample Road, Colombo',
  phone: '011 123 4567',
  category: 'Undergraduate',
  field: 'Information and Communication Technology',
  instituteRegistration: 'ICT/TEST/001',
  naitaRegistration: 'TEST/001',
  establishment: 'Example Software Team',
  trainingLocation: 'Colombo office',
  trainingStart: '2026-04-06',
  trainingEnd: '2026-04-17',
};
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
);
// A generated 2x2 JPEG, small enough to exercise Node's pooled file buffers.
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAA//Z',
  'base64',
);
export function fixture(profile = PROFILE) {
  const root = mkdtempSync(join(tmpdir(), 'naita-test-'));
  const workspace = join(root, 'diary workspace');
  const repo = join(root, 'external repository');
  mkdirSync(workspace);
  mkdirSync(repo);
  saveProfile(workspace, structuredClone(profile));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Sample Trainee']);
  git(repo, ['config', 'user.email', 'trainee@example.test']);
  return { root, workspace, repo, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
export function git(repo, args, env = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export function commit(
  repo,
  date,
  subject,
  { body = '', committerDate = date, authorName = 'Sample Trainee', authorEmail = 'trainee@example.test' } = {},
) {
  git(
    repo,
    ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', subject, ...(body ? ['-m', body] : [])],
    {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: committerDate,
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
    },
  );
  return git(repo, ['rev-parse', 'HEAD']);
}
export function seedRepo(repo) {
  commit(repo, '2026-04-06T10:00:00+05:30', 'feat(search): add a search box to the task list', {
    body: 'Users can find tasks by title.',
  });
  commit(repo, '2026-04-07T15:00:00+05:30', 'fix: handle an empty search result');
  commit(repo, '2026-04-13T11:00:00+05:30', 'test: add checks for task filtering');
}
export function cli(workspace, command, options = {}) {
  const args = [join(ROOT, 'src/cli.mts'), command, '--workspace', workspace, '--json'];
  for (const [key, value] of Object.entries(options)) {
    if (value === false || value === undefined) continue;
    for (const part of Array.isArray(value) ? value : [value]) {
      args.push(`--${key}`);
      if (part !== true) args.push(String(part));
    }
  }
  return JSON.parse(execFileSync('bun', ['run', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}
export function screenshot(folder, name = '01-task-list.png') {
  writeFileSync(join(folder, name), PNG);
}
