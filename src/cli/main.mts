import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parseArgs } from './args.mts';
import { HELP } from './help.mts';
import { profileCommand } from './profile.mts';
import { weeklyCommand } from './weekly.mts';
import { generate } from './export.mts';
import { loadDiary, loadProfile, loadState, ensureWeeks, selectWeek } from '../diary/store.mts';
import { diaryStatus, formatStatus } from '../diary/status.mts';
import { prepareDiary, draftWeeks } from '../diary/workflow.mts';
import { agentContext, agentPrompt } from '../ai/prompt.mts';
import { paths, hasLegacyData, initializeLocal } from '../diary/paths.mts';
import { checkpoint, readHistory } from '../diary/history.mts';
import { createChecklist, formatChecklist, saveChecklist } from '../diary/checklist.mts';

export async function execute(command, options = {}) {
  const workspace = resolve(options.workspace || process.cwd());
  if (['help', 'agent-guide'].includes(command) || options['dry-run']) return dispatch(command, workspace, options);
  let migrated = false;
  if (!existsSync(paths(workspace).local) && hasLegacyData(workspace)) migrated = initializeLocal(workspace);
  checkpoint(workspace, migrated ? 'migration' : 'external-edit', { observedBy: command });
  const details = {
    actor: options.actor || 'cli',
    ...(options.reason ? { reason: options.reason } : {}),
    target: Object.fromEntries(
      ['week', 'date', 'section', 'id', 'before']
        .filter((key) => options[key] !== undefined)
        .map((key) => [key, options[key]]),
    ),
  };
  try {
    const result = await dispatch(command, workspace, options);
    checkpoint(
      workspace,
      command,
      {
        ...details,
        outcome: 'success',
        ...(command === 'generate'
          ? { output: { path: result.path, pages: result.pages, complete: result.complete } }
          : {}),
      },
      command === 'generate',
    );
    if (command === 'checklist' || existsSync(paths(workspace).profile)) {
      try {
        const checklist = command === 'checklist' ? result : await createChecklist(workspace);
        saveChecklist(checklist);
        if (command === 'import') result.checklist = checklist;
      } catch (error) {
        if (command === 'checklist') throw error;
        // A derived report must not hide successful edits or prevent inspecting
        // a damaged week via history. Report that the saved checklist is stale.
        const warning = `Checklist was not refreshed: ${error.message}. Run checklist after fixing the problem.`;
        if (typeof result === 'object') result.checklistWarning = warning;
        else console.error(warning);
      }
    }
    if (command === 'checklist' && options.week) return { ...result, weeks: [selectWeek(result, options.week)] };
    return result;
  } catch (error) {
    checkpoint(workspace, command, { ...details, outcome: 'failed' });
    throw error;
  }
}

async function dispatch(command, workspace, options) {
  if (command === 'help') return HELP;
  if (command === 'agent-guide') return readFileSync(new URL('../../docs/AI-WORKFLOW.md', import.meta.url), 'utf8');
  if (command === 'checklist') {
    initializeLocal(workspace);
    const checklist = await createChecklist(workspace);
    if (options.week) selectWeek(checklist, options.week);
    return checklist;
  }
  if (command === 'history') {
    const events = readHistory(workspace);
    if (!options.week) return { path: paths(workspace).journal, events };
    const week = selectWeek(loadDiary(workspace), options.week);
    const key = `weeks/${basename(week.file)}`;
    const images = `screenshots/${basename(week.screenshotFolder)}/`;
    return {
      path: paths(workspace).journal,
      events: events.filter((event) =>
        event.changes.some((change) => change.path === key || change.path.startsWith(images)),
      ),
    };
  }
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
  else if (command === 'checklist') console.log(formatChecklist(result, { markdown: false }));
  else if (command === 'import' && result.checklist)
    console.log(`${result.message}\n\n${formatChecklist(result.checklist, { markdown: false })}`);
  else if (typeof result === 'string') console.log(result);
  else if (result.message) console.log(result.message);
  else console.log(JSON.stringify(result, null, 2));
  if (result.checklistWarning && !options.json) console.error(result.checklistWarning);
  return result;
}
