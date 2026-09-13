import { resolve } from 'node:path';
import { runSync } from '../runtime/process.mts';

function git(repo, args) {
  const result = runSync(['git', '-C', resolve(repo), ...args], process.cwd());
  if (!result.success) throw new Error(`Cannot read Git repository ${repo}: ${result.stderr.trim()}`);
  return result.stdout;
}
export function gitHistory(repos, start, end, author = '') {
  const commits = new Map();
  for (const repo of repos) {
    git(repo, ['rev-parse', '--git-dir']);
    if (!git(repo, ['rev-list', '--all', '--max-count=1']).trim()) continue;
    // Git --since filters committer dates. Read and filter author dates ourselves,
    // so rebases and cherry-picks cannot silently drop internship work.
    const raw = git(repo, [
      'log',
      '--all',
      '--no-merges',
      '-z',
      '--format=%H%x00%aI%x00%an%x00%ae%x00%s%x00%b',
      ...(author ? ['--fixed-strings', `--author=${author}`] : []),
    ]);
    const fields = raw.split('\0');
    if (fields.at(-1) === '') fields.pop();
    for (let i = 0; i < fields.length; i += 6) {
      const [hash, authoredAt, name, email, subject, body] = fields.slice(i, i + 6);
      if (!body && body !== '') throw new Error('Git history could not be parsed.');
      const date = authoredAt.slice(0, 10);
      if (date < start || date > end) continue;
      if (!commits.has(hash))
        commits.set(hash, { hash, date, authoredAt, author: name, email, subject, body: body.trim(), repos: [] });
      const paths = commits.get(hash).repos;
      if (!paths.includes(resolve(repo))) paths.push(resolve(repo));
    }
  }
  return [...commits.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.authoredAt.localeCompare(b.authoredAt) || a.hash.localeCompare(b.hash),
  );
}
