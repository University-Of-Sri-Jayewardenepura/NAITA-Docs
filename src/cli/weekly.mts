import { basename } from 'node:path';
import { ensureWeeks, selectWeek, saveWeek } from '../diary/store.mts';
import { editPoint, dailyPoints, point } from '../diary/entries.mts';
import { resolveSuggestion } from '../ai/suggestions.mts';
import { diaryStatus } from '../diary/status.mts';
import { scanScreenshots } from '../diary/screenshots.mts';

export async function weeklyCommand(command, workspace, options) {
  const diary = ensureWeeks(workspace);
  const week = selectWeek(diary, options.week);
  if (command === 'add' || command === 'edit') {
    if (command === 'edit' && !options.id) throw new Error('edit requires --id.');
    if (options.date) {
      const day = week.days.find((day) => day.date === options.date);
      if (!day || day.status !== 'work')
        throw new Error('Daily work can only be added to a work date. Update attendance first.');
      if (command === 'add' && !week.entry.days[day.date].length)
        week.entry.days[day.date] = dailyPoints(day, week.entry).map((value) => point(value.text, 'git'));
    }
    editPoint(week.entry, options);
  } else if (command === 'accept' || command === 'dismiss') {
    const available = new Set(
      week.days.filter((day) => day.status === 'work').flatMap((day) => day.commits.map((commit) => commit.hash)),
    );
    if (command === 'accept') {
      const selected = week.entry.suggestions.filter((item) =>
        options['accept-drafts'] ? item.kind === 'draft' && item.section === 'work' : item.id === options.id,
      );
      if (selected.some((item) => item.evidence.some((hash) => !available.has(hash))))
        throw new Error(
          'Suggestion evidence no longer belongs to a work date in this week. Check attendance/history and dismiss the stale suggestion.',
        );
    }
    if (options['accept-drafts']) {
      if (options.id || options.text || options.before)
        throw new Error('--accept-drafts cannot be combined with --id, --text, or --before.');
      for (const suggestion of week.entry.suggestions) {
        if (suggestion.kind === 'draft' && suggestion.section === 'work') resolveSuggestion(week.entry, suggestion.id);
      }
    } else {
      if (!options.id) throw new Error('Choose a suggestion with --id.');
      resolveSuggestion(week.entry, options.id, {
        text: options.text,
        before: options.before,
        dismiss: command === 'dismiss',
      });
    }
  } else if (command === 'review') {
    const status = (await diaryStatus(diary)).weeks.find((status) => status.number === week.number);
    if (
      status.filled !== status.total ||
      status.suggestions ||
      status.conflicts.length ||
      diary.state.absence.leave === null ||
      diary.state.absence.medical === null
    ) {
      const gaps = [
        ...status.missing,
        ...status.missingDays,
        ...status.screenshots.errors,
        ...(status.suggestions ? [`${status.suggestions} pending suggestions`] : []),
        ...(status.conflicts.length ? [`attendance conflicts: ${status.conflicts.join(', ')}`] : []),
        ...(!status.screenshots.images.length && !status.screenshots.notRequiredReason ? ['screenshots needed'] : []),
        ...(diary.state.absence.leave === null || diary.state.absence.medical === null
          ? ['confirm leave and medical dates']
          : []),
      ];
      throw new Error(`Week ${week.number} is not ready for review: ${gaps.join('; ')}. Run status for details.`);
    }
    week.entry.reviewedFingerprint = status.fingerprint;
  } else if (command === 'screenshots') {
    if (options.file !== undefined) {
      if (basename(options.file) !== options.file || !options.file || options.text === undefined)
        throw new Error('Use --file NAME (no directories) with --text CAPTION.');
      const inventory = await scanScreenshots(week);
      if (!inventory.images.some((image) => image.name === options.file))
        throw new Error('Screenshot not found or invalid. Place it in the week folder first.');
      week.entry.screenshots.captions[options.file] = options.text.trim();
    } else if (options.text !== undefined) throw new Error('--text requires a screenshot --file.');
    if (options.reason !== undefined) week.entry.screenshots.notRequiredReason = options.reason.trim();
    if (options.file === undefined && options.reason === undefined) return scanScreenshots(week);
  }
  saveWeek(workspace, week);
  return { message: `Saved week ${week.number}.`, file: week.file, week: week.entry };
}
