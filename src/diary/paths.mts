import { existsSync, mkdirSync, writeFileSync, mkdtempSync, cpSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function paths(workspace = process.cwd()) {
  const root = resolve(workspace);
  const local = join(root, 'local');
  return {
    root,
    local,
    profile: join(local, 'profile.json'),
    state: join(local, 'state.json'),
    weeks: join(local, 'weeks'),
    screenshots: join(local, 'screenshots'),
    output: join(local, 'output'),
    history: join(local, 'history'),
    journal: join(local, 'history', 'changes.jsonl'),
    checklist: join(local, 'CHECKLIST.md'),
    checklistJson: join(local, 'checklist.json'),
  };
}

export function legacyPaths(workspace) {
  const { root } = paths(workspace);
  return {
    profile: join(root, 'naita-diary.json'),
    state: join(root, 'diary', 'state.json'),
    weeks: join(root, 'diary', 'weeks'),
    screenshots: join(root, 'diary', 'screenshots'),
    output: join(root, 'output'),
  };
}

export function hasLegacyData(workspace) {
  const legacy = legacyPaths(workspace);
  return [legacy.profile, legacy.state, legacy.weeks].some((path) => existsSync(path));
}

// Dry runs can read an older workspace without migrating or creating files.
export function readPaths(workspace) {
  const location = paths(workspace);
  return !existsSync(location.local) && hasLegacyData(workspace)
    ? { ...location, ...legacyPaths(workspace) }
    : location;
}

export function initializeLocal(workspace) {
  const location = paths(workspace);
  let migrated = false;
  if (!existsSync(location.local) && hasLegacyData(workspace)) {
    mkdirSync(location.root, { recursive: true });
    const staging = mkdtempSync(join(location.root, '.naita-migrate-'));
    writeFileSync(join(staging, '.gitignore'), '*\n', { flag: 'wx' });
    const legacy = legacyPaths(workspace);
    for (const [key, name] of Object.entries({
      profile: 'profile.json',
      state: 'state.json',
      weeks: 'weeks',
      screenshots: 'screenshots',
      output: 'output',
    })) {
      if (existsSync(legacy[key]))
        cpSync(legacy[key], join(staging, name), { recursive: true, errorOnExist: true, force: false });
    }
    // Publish only a complete copy. Older files remain as a recoverable backup.
    renameSync(staging, location.local);
    migrated = true;
  }
  for (const path of [location.local, location.weeks, location.screenshots, location.output, location.history])
    mkdirSync(path, { recursive: true });
  const ignore = join(location.local, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n', { flag: 'wx' });
  return migrated;
}
