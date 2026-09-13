import { resolve } from 'node:path';
import { calendar } from './dates.mts';
import { updateAbsence } from './attendance.mts';
import { gitHistory } from '../git/history.mts';
import { loadDiary, ensureWeeks, saveState, saveWeek, selectWeek, readJson } from './store.mts';
import { baselineSuggestions, mergeSuggestions, validateAgentResponse } from '../ai/suggestions.mts';
import { agentPrompt } from '../ai/prompt.mts';
import { runAgent } from '../ai/runner.mts';

export function prepareDiary(workspace, options = {}, { persist = true } = {}) {
  const diary = loadDiary(workspace);
  let state = updateAbsence(diary.state, diary.config, options);
  if (options.repo || options.sync) {
    const repos = options.repo
      ? (Array.isArray(options.repo) ? options.repo : [options.repo]).map((repo) => resolve(repo))
      : state.repos;
    if (!repos.length) throw new Error('Provide a Git repository with --repo PATH.');
    const author = options.author ?? state.author;
    state = {
      ...state,
      repos,
      author,
      commits: gitHistory(repos, diary.config.trainingStart, diary.config.trainingEnd, author),
      importedAt: new Date().toISOString(),
    };
  }
  const weeks = calendar(diary.config, state.commits, state.absence).map((week, index) => ({
    ...diary.weeks[index],
    ...week,
  }));
  if (persist) {
    ensureWeeks(workspace);
    saveState(workspace, { ...state, period: { start: diary.config.trainingStart, end: diary.config.trainingEnd } });
  }
  return { ...diary, state, weeks };
}
export async function draftWeeks(workspace, options) {
  const diary = ensureWeeks(workspace);
  const weeks = options.week ? [selectWeek(diary, options.week)] : diary.weeks;
  if (options.from && (options.agent || options['agent-command'])) throw new Error('Choose --from or a writing agent.');
  let generated;
  if (options.from || options.agent || options['agent-command']) {
    const response = options.from
      ? readJson(resolve(options.from))
      : await runAgent(options, agentPrompt(weeks), workspace);
    generated = validateAgentResponse(response, weeks);
  } else generated = weeks.map((week) => ({ monday: week.monday, suggestions: baselineSuggestions(week) }));
  // Re-read after a long-running agent so manual changes made in the meantime survive.
  const latest = loadDiary(workspace);
  validateAgentResponse(
    { weeks: generated },
    latest.weeks.filter((week) => weeks.some((selected) => selected.monday === week.monday)),
  );
  for (const result of generated) {
    const week = selectWeek(latest, result.monday);
    mergeSuggestions(week.entry, result.suggestions);
    saveWeek(workspace, week);
  }
  return loadDiary(workspace);
}
