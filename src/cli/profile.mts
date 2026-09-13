import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { PROFILE_FIELDS } from '../diary/profile.mts';
import { loadProfile, readJson, saveProfile, ensureWeeks } from '../diary/store.mts';

export async function ask(question, defaultValue = '') {
  if (!stdin.isTTY)
    throw new Error(
      `${question} must be supplied as an option when running non-interactively. Use an empty string for no leave/medical dates.`,
    );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `)).trim() || defaultValue;
  } finally {
    rl.close();
  }
}
export async function profileCommand(workspace, options, interactive = false) {
  let config = loadProfile(workspace);
  if (options.from) config = { ...config, ...readJson(resolve(options.from)) };
  if (options.field) {
    if (!Object.hasOwn(PROFILE_FIELDS, options.field)) throw new Error(`Unknown profile field: ${options.field}.`);
    if (options.text === undefined) throw new Error('--field requires --text.');
    config[options.field] = options.text.trim();
  } else if (options.text !== undefined) throw new Error('--text requires --field.');
  if (interactive && !options.from)
    for (const [key, label] of Object.entries(PROFILE_FIELDS)) config[key] = await ask(label, config[key]);
  if (interactive || options.from || options.field) {
    saveProfile(workspace, config);
    if (config.trainingStart && config.trainingEnd) ensureWeeks(workspace);
  }
  return config;
}
