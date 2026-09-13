import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from './args.mts';
import { HELP } from './help.mts';
import { profileCommand } from './profile.mts';
import { weeklyCommand } from './weekly.mts';
import { generate } from './export.mts';
import { loadDiary, loadProfile, loadState, ensureWeeks, selectWeek } from '../diary/store.mts';
import { diaryStatus, formatStatus } from '../diary/status.mts';
import { prepareDiary, draftWeeks } from '../diary/workflow.mts';
import { agentContext, agentPrompt } from '../ai/prompt.mts';

export async function execute(command, options = {}) {
  const workspace = resolve(options.workspace || process.cwd());
  if (command === 'help') return HELP;
  if (command === 'agent-guide') return readFileSync(new URL('../../docs/AI-WORKFLOW.md', import.meta.url), 'utf8');
  if (command === 'init' || command === 'profile') return profileCommand(workspace, options, command === 'init');
  if (command === 'weeks')
    return {
      message: 'Week files and screenshot folders are ready.',
      weeks: ensureWeeks(workspace).weeks.map(({ number, monday, sunday, file, screenshotFolder }) => ({
        number,
        monday,
        sunday,
        file,
        screenshotFolder,
      })),
    };
  if (command === 'status') {
    const config = loadProfile(workspace);
    const diary =
      config.trainingStart && config.trainingEnd
        ? loadDiary(workspace)
        : { config, state: loadState(workspace), weeks: [] };
    if (options.week) diary.weeks = [selectWeek(diary, options.week)];
    return diaryStatus(diary);
  }
  if (command === 'import' || command === 'absence') {
    if (command === 'absence' && !['leave', 'medical', 'off'].some((key) => options[key] !== undefined))
      throw new Error('Supply --leave, --medical, or --off (use "" for none).');
    const diary = prepareDiary(workspace, { ...options, sync: command === 'import' });
    return {
      message:
        command === 'import'
          ? `Imported ${diary.state.commits.length} commits from ${diary.state.repos.length} repositories. Existing points are preserved.`
          : 'Saved absence dates.',
      state: diary.state,
    };
  }
  if (command === 'show' || command === 'context') {
    const diary = loadDiary(workspace);
    const weeks = options.week ? [selectWeek(diary, options.week)] : diary.weeks;
    if (command === 'show') return selectWeek(diary, options.week);
    return options.prompt
      ? agentPrompt(weeks)
      : {
          instructions:
            'Use agent-guide for the CLI workflow. Add proposals with draft --from FILE; accepted points remain untouched.',
          weeks: agentContext(weeks),
        };
  }
  if (command === 'draft') {
    const diary = await draftWeeks(workspace, options);
    return {
      message: 'Suggestions saved for review. Use show, accept, or dismiss.',
      weeks: diary.weeks
        .filter((week) => !options.week || week.number === selectWeek(diary, options.week).number)
        .map((week) => ({ number: week.number, suggestions: week.entry.suggestions })),
    };
  }
  if (['add', 'edit', 'accept', 'dismiss', 'review', 'screenshots'].includes(command))
    return weeklyCommand(command, workspace, options);
  if (command === 'generate') return generate(workspace, options);
  throw new Error(`Unknown command: ${command}`);
}
export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  const result = await execute(command, options);
  if (options.json || (command === 'generate' && options['dry-run'])) console.log(JSON.stringify(result, null, 2));
  else if (command === 'status') console.log(formatStatus(result));
  else if (typeof result === 'string') console.log(result);
  else if (result.message) console.log(result.message);
  else console.log(JSON.stringify(result, null, 2));
  return result;
}
