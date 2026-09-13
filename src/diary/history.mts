import { existsSync, readFileSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { paths } from './paths.mts';

export function readHistory(workspace) {
  const file = paths(workspace).journal;
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        const event = JSON.parse(line);
        if (
          event.schemaVersion !== 1 ||
          !Array.isArray(event.changes) ||
          !event.changes.every(
            (change) =>
              change &&
              typeof change.path === 'string' &&
              Object.hasOwn(change, 'before') &&
              Object.hasOwn(change, 'after'),
          )
        )
          throw new Error('Invalid event');
        return event;
      } catch {
        throw new Error(`Cannot read history event ${index + 1} in ${file}. Restore the log before continuing.`);
      }
    });
}

function currentFiles(workspace) {
  const location = paths(workspace);
  const files = {};
  function capture(path, json) {
    if (!existsSync(path)) return;
    const bytes = readFileSync(path);
    const key = relative(location.local, path).split('\\').join('/');
    if (json) {
      const text = bytes.toString('utf8');
      try {
        files[key] = { kind: 'json', value: JSON.parse(text) };
      } catch {
        files[key] = { kind: 'text', value: text };
      }
    } else {
      files[key] = { kind: 'file', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
  capture(location.profile, true);
  capture(location.state, true);
  if (existsSync(location.weeks))
    for (const file of readdirSync(location.weeks)
      .filter((name) => name.endsWith('.json'))
      .sort())
      capture(join(location.weeks, file), true);
  function images(folder) {
    if (!existsSync(folder)) return;
    for (const file of readdirSync(folder, { withFileTypes: true })) {
      if (file.isDirectory()) images(join(folder, file.name));
      else if (file.isFile() && /\.(png|jpe?g)$/i.test(file.name)) capture(join(folder, file.name), false);
    }
  }
  images(location.screenshots);
  return files;
}

// JSONL is the source of truth: each append includes before/after values, so a
// deleted or edited point remains recoverable without a separate mutable index.
export function checkpoint(workspace, action, details = {}, recordUnchanged = false) {
  const location = paths(workspace);
  if (!existsSync(location.local)) return;
  const previous = {};
  for (const event of readHistory(workspace))
    for (const change of event.changes) {
      if (change.after === null) delete previous[change.path];
      else previous[change.path] = change.after;
    }
  const current = currentFiles(workspace);
  const changes = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .sort()
    .filter((path) => !isDeepStrictEqual(previous[path], current[path]))
    .map((path) => ({ path, before: previous[path] ?? null, after: current[path] ?? null }));
  if (!changes.length && !recordUnchanged) return;
  const event = { schemaVersion: 1, id: randomUUID(), at: new Date().toISOString(), action, ...details, changes };
  mkdirSync(location.history, { recursive: true });
  appendFileSync(location.journal, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  return event;
}
