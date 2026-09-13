import { createHash } from 'node:crypto';
import { dailyPoints, SECTIONS } from './entries.mts';
import { PROFILE_FIELDS, REQUIRED_FIELDS } from './profile.mts';
import { scanScreenshots } from './screenshots.mts';

export function fingerprint(week, config, state, screenshots) {
  const entry = {
    ...week.entry,
    reviewedFingerprint: undefined,
    suggestions: undefined,
    dismissedSuggestions: undefined,
  };
  return createHash('sha256')
    .update(
      JSON.stringify({
        entry,
        config,
        absence: state.absence,
        days: week.days,
        images: screenshots.images.map(({ name, hash, caption }) => ({ name, hash, caption })),
        errors: screenshots.errors,
      }),
    )
    .digest('hex');
}
export async function diaryStatus(diary) {
  const { config, state } = diary;
  const profileMissing = Object.keys(PROFILE_FIELDS).filter((key) => !config[key]?.trim());
  const requiredMissing = REQUIRED_FIELDS.filter((key) => !config[key]?.trim());
  const absencesConfirmed = state.absence.leave !== null && state.absence.medical !== null;
  const weeks = await Promise.all(
    diary.weeks.map(async (week) => {
      const screenshots = await scanScreenshots(week);
      const sections = Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, week.entry.sections[key].length]));
      const missing = Object.keys(sections).filter((key) => sections[key] === 0);
      const workDays = week.days.filter((day) => day.status === 'work');
      const missingDays = workDays.filter((day) => !dailyPoints(day, week.entry).length).map((day) => day.date);
      const imagesDone =
        !screenshots.errors.length && (screenshots.images.length > 0 || Boolean(screenshots.notRequiredReason.trim()));
      const total = Object.keys(SECTIONS).length + workDays.length + 1;
      const filled =
        Object.keys(SECTIONS).length - missing.length + workDays.length - missingDays.length + Number(imagesDone);
      const currentFingerprint = fingerprint(week, config, state, screenshots);
      const reviewed = week.entry.reviewedFingerprint === currentFingerprint;
      const pending = week.entry.suggestions.length;
      const conflicts = week.days
        .filter(
          (day) =>
            ['leave', 'medical', 'off'].includes(day.status) &&
            (day.commits.length || week.entry.days[day.date].length),
        )
        .map((day) => day.date);
      const complete =
        filled === total && absencesConfirmed && !requiredMissing.length && !pending && reviewed && !conflicts.length;
      return {
        number: week.number,
        monday: week.monday,
        sunday: week.sunday,
        sections,
        missing,
        missingDays,
        screenshots,
        suggestions: pending,
        reviewed,
        conflicts,
        complete,
        filled,
        total,
        percent: Math.round((filled / total) * 100),
        fingerprint: currentFingerprint,
        file: week.file,
      };
    }),
  );
  return {
    profile: {
      filled: Object.keys(PROFILE_FIELDS).length - profileMissing.length,
      total: Object.keys(PROFILE_FIELDS).length,
      missing: profileMissing,
      requiredMissing,
    },
    absencesConfirmed,
    absence: state.absence,
    gitImported: Boolean(state.importedAt),
    repos: state.repos,
    commits: state.commits.length,
    complete: weeks.length > 0 && weeks.every((week) => week.complete),
    completedWeeks: weeks.filter((week) => week.complete).length,
    weeks,
  };
}
export function formatStatus(status) {
  const lines = [
    `Profile: ${status.profile.filled}/${status.profile.total} fields filled.`,
    `Absences: ${status.absencesConfirmed ? 'confirmed' : 'need leave and medical dates (empty lists are fine)'}.`,
    `Git: ${status.gitImported ? `${status.commits} commits imported` : 'not imported; manual entries are supported'}.`,
    `Weeks ready: ${status.completedWeeks}/${status.weeks.length}.`,
  ];
  if (status.profile.missing.length) lines.push(`Profile fields still blank: ${status.profile.missing.join(', ')}.`);
  for (const week of status.weeks) {
    lines.push(
      `\nWeek ${week.number} (${week.monday} to ${week.sunday}): ${week.filled}/${week.total} filled (${week.percent}%) | ${week.complete ? 'READY' : 'IN PROGRESS'}`,
    );
    lines.push(
      `  Sections: ${Object.entries(week.sections)
        .map(([key, count]) => `${key} ${count}`)
        .join(' | ')}`,
    );
    lines.push(
      `  Screenshots: ${week.screenshots.images.length}${week.screenshots.notRequiredReason ? ' (not required: ' + week.screenshots.notRequiredReason + ')' : ''} | Suggestions: ${week.suggestions} | Review: ${week.reviewed ? 'current' : 'needed'}`,
    );
    if (week.missing.length) lines.push(`  Fill: ${week.missing.join(', ')}.`);
    if (week.missingDays.length) lines.push(`  Daily work missing: ${week.missingDays.join(', ')}.`);
    if (!week.screenshots.images.length && !week.screenshots.notRequiredReason)
      lines.push(`  Add screenshots: ${week.screenshots.folder}`);
    if (week.screenshots.errors.length) lines.push(`  Invalid screenshots: ${week.screenshots.errors.join('; ')}`);
    if (week.screenshots.ignored.length)
      lines.push(`  Unsupported files/folders: ${week.screenshots.ignored.join(', ')} (use PNG/JPEG).`);
    if (week.conflicts.length)
      lines.push(
        `  Work evidence on leave/non-working dates: ${week.conflicts.join(', ')}. Resolve attendance or move the notes.`,
      );
  }
  return lines.join('\n');
}
