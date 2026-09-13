import { existsSync, readFileSync } from 'node:fs';
import { paths, loadDiary, loadProfile, loadState } from './store.mts';
import { writeText } from './files.mts';
import { diaryStatus } from './status.mts';
import { SECTIONS } from './entries.mts';
import { screenshotIdeas } from './screenshot-plan.mts';
import { readHistory } from './history.mts';

const task = (id, done, label, detail, command) => ({ id, done: Boolean(done), label, detail, command });

export async function createChecklist(workspace) {
  const location = paths(workspace);
  const config = loadProfile(workspace);
  const diary =
    config.trainingStart && config.trainingEnd
      ? loadDiary(workspace)
      : { config, state: loadState(workspace), weeks: [] };
  const status = await diaryStatus(diary);
  const weeks = diary.weeks.map((week, index) => {
    const progress = status.weeks[index];
    const imagesDone =
      !progress.screenshots.errors.length &&
      (progress.screenshots.images.length > 0 || Boolean(progress.screenshots.notRequiredReason.trim()));
    const tasks = [
      task(
        'daily',
        !progress.missingDays.length,
        'Check dated work entries',
        progress.missingDays.length
          ? `Still missing: ${progress.missingDays.join(', ')}`
          : 'Check that each date describes your actual work.',
        `show --week ${week.number}`,
      ),
      ...Object.entries(SECTIONS).map(([key, label]) =>
        task(
          `section-${key}`,
          progress.sections[key] > 0,
          label,
          `${progress.sections[key]} saved points`,
          `show --week ${week.number}`,
        ),
      ),
      task(
        'suggestions',
        !progress.suggestions,
        'Resolve writing suggestions',
        `${progress.suggestions} suggestions still need accepting, answering, or dismissing.`,
        `show --week ${week.number}`,
      ),
      task(
        'conflicts',
        !progress.conflicts.length,
        'Resolve attendance conflicts',
        progress.conflicts.length
          ? `Check work on leave/non-working dates: ${progress.conflicts.join(', ')}`
          : 'No conflicting work dates.',
        'status',
      ),
      task(
        'screenshots',
        imagesDone,
        'Add screenshots LAST, then check captions',
        [
          `${progress.screenshots.images.length} valid images.`,
          progress.screenshots.notRequiredReason,
          ...progress.screenshots.errors,
          ...(progress.screenshots.ignored.length ? [`Unsupported: ${progress.screenshots.ignored.join(', ')}`] : []),
        ]
          .filter(Boolean)
          .join(' '),
        `screenshots --week ${week.number}`,
      ),
      task(
        'review',
        progress.reviewed,
        'Review this week after adding screenshots',
        'Changing notes or images makes a previous review out of date.',
        `review --week ${week.number}`,
      ),
    ];
    return {
      number: week.number,
      monday: week.monday,
      sunday: week.sunday,
      file: week.file,
      folder: week.screenshotFolder,
      writingDone: tasks.filter((item) => !['screenshots', 'review'].includes(item.id)).every((item) => item.done),
      complete: progress.complete,
      tasks,
      screenshots: progress.screenshots,
      ideas: screenshotIdeas(week),
    };
  });
  const events = readHistory(workspace);
  const exportIndex = events.findLastIndex((event) => event.action === 'generate' && event.outcome === 'success');
  const lastExport = events[exportIndex]?.output;
  const exportCurrent =
    lastExport?.complete &&
    existsSync(lastExport.path) &&
    events.slice(exportIndex + 1).every((event) => !event.changes.length) &&
    status.complete;
  return {
    schemaVersion: 1,
    path: location.checklist,
    jsonPath: location.checklistJson,
    instructions:
      'Finish written notes first. Add real screenshots last, then review and export. Capture ideas are optional suggestions from cached Git messages and saved work notes, not proof of a screen or result. Choose representative images; you do not need one for every commit. Redact secrets and personal data.',
    complete: Boolean(exportCurrent),
    tasks: [
      task(
        'profile',
        !status.profile.requiredMissing.length,
        'Fill student information and training dates',
        status.profile.missing.length
          ? `Blank fields: ${status.profile.missing.join(', ')}. Required: ${status.profile.requiredMissing.join(', ') || 'none'}.`
          : 'All profile fields are filled.',
        'profile',
      ),
      task(
        'attendance',
        status.absencesConfirmed,
        'Confirm leave, medical, and non-working dates',
        'Empty leave/medical lists are valid, but must be explicitly confirmed.',
        'absence',
      ),
      task(
        'evidence',
        status.gitImported || (weeks.length > 0 && status.weeks.every((week) => !week.missingDays.length)),
        'Import Git evidence, or provide manual daily work',
        `${status.commits} cached commits across ${status.repos.length} repositories. No source repository is read by checklist.`,
        'import',
      ),
      task(
        'writing',
        weeks.length > 0 && weeks.every((week) => week.writingDone),
        'Finish all weekly and daily writing',
        'Resolve suggestions and attendance conflicts before collecting screenshots.',
        'show --week NUMBER',
      ),
      task(
        'screenshots',
        weeks.length > 0 && weeks.every((week) => week.tasks.find((item) => item.id === 'screenshots').done),
        'Add screenshots LAST to the matching week folders',
        'Use the capture ideas below. A valid image or a student-supplied no-screenshots reason completes each screenshot step; image contents still need your review.',
        'checklist --week NUMBER',
      ),
      task(
        'review',
        status.complete,
        'Review every week after checking the images',
        'Verify that each screenshot matches the activity and week. File presence does not verify its content.',
        'review --week NUMBER',
      ),
      task(
        'export',
        exportCurrent,
        'Export the completed PDF',
        lastExport
          ? `Last export: ${lastExport.path}${exportCurrent ? '' : ' (draft, missing, or no longer confirmed current)'}`
          : 'Draft exports are available before screenshots are added; final export requires completed weeks.',
        'generate --strict',
      ),
    ],
    weeks,
  };
}

function plain(value) {
  // oxlint-disable-next-line no-control-regex -- do not render terminal controls from source messages
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}
// Markdown needs escaping, while the CLI must show literal, copyable paths.
function escaped(value) {
  return plain(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}#!|])/g, '\\$1');
}
export function formatChecklist(checklist, { markdown = true } = {}) {
  const text = markdown ? escaped : plain;
  const lines = [
    '# Diary checklist — screenshots last',
    '',
    checklist.instructions,
    '',
    'Generated from saved data. Do not edit this report: it is refreshed by the CLI. Update notes, attendance and captions through the CLI or weekly JSON instead.',
    '',
    `Saved checklist: ${text(checklist.path)}`,
    '',
    '## Tasks',
    '',
    ...checklist.tasks.flatMap((item) => [
      `- [${item.done ? 'x' : ' '}] ${item.label} — bun run cli -- ${item.command}`,
      `  - ${text(item.detail)}`,
    ]),
  ];
  if (!checklist.weeks.length)
    lines.push('', 'Set both training dates with init/profile to create the weekly folders and screenshot plan.');
  for (const week of checklist.weeks) {
    lines.push(
      '',
      `## Week ${week.number}: ${week.monday} to ${week.sunday}`,
      '',
      `Screenshot folder: ${text(week.folder)}`,
      '',
      ...week.tasks.map(
        (item) => `- [${item.done ? 'x' : ' '}] ${item.label}${!item.done ? ` — ${text(item.detail)}` : ''}`,
      ),
      '',
      '### What to capture later (optional ideas)',
      '',
    );
    if (!week.ideas.length)
      lines.push(
        'No work-date Git evidence or saved work notes for this week yet. Add the actual work first; no screenshot content is being guessed. If no visual evidence is suitable, supply a reason with screenshots --week NUMBER --reason TEXT.',
      );
    for (const idea of week.ideas) {
      lines.push(
        `- ${text(idea.activity)}`,
        `  - ${idea.capture}`,
        `  - Suggested file: ${text(idea.path)}`,
        `  - Source: ${idea.source === 'git' ? 'Git' : 'student work note'}; dates: ${idea.dates.join(', ') || 'whole week (no specific day supplied)'}.`,
        ...(idea.repos.length ? [`  - Source repositories: ${idea.repos.map(text).join('; ')}`] : []),
        ...(idea.evidence.length ? [`  - Commit references: ${idea.evidence.map(text).join(', ')}`] : []),
      );
    }
    if (week.screenshots.images.length)
      lines.push(
        '',
        `Already present (content not verified): ${week.screenshots.images.map((image) => text(image.name)).join(', ')}.`,
      );
    lines.push(
      '',
      `After placing PNG/JPEG files, run: bun run cli -- screenshots --week ${week.number}`,
      `Set a caption with: bun run cli -- screenshots --week ${week.number} --file NAME --text "What this shows"`,
      `Then review: bun run cli -- review --week ${week.number}`,
    );
  }
  lines.push(
    '',
    'Commands shown above run from the diary workspace. Add --workspace PATH when using another workspace.',
    'Suggested filenames are optional; existing PNG/JPEG filenames are supported. Never fabricate historical screenshots or overwrite source work to reproduce one.',
    '',
  );
  return lines.join('\n');
}

export function saveChecklist(checklist) {
  for (const [file, content] of [
    [checklist.path, formatChecklist(checklist)],
    [checklist.jsonPath, `${JSON.stringify(checklist, null, 2)}\n`],
  ]) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) writeText(file, content);
  }
}
