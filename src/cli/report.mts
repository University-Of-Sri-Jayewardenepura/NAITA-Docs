import { join, resolve } from 'node:path';
import { loadDiary, paths } from '../diary/store.mts';
import { diaryStatus } from '../diary/status.mts';
import { renderReport } from '../pdf/report.mts';

const DEFAULT_NAME = 'NAITA-Industrial-Training-Report-Pruthivi-Thejan-draft.pdf';

export async function reportCommand(workspace, options = {}) {
  const diary = loadDiary(workspace);
  const status = await diaryStatus(diary);
  const reportRoot = join(paths(workspace).local, 'report');
  const output = resolve(options.out || join(reportRoot, 'output', DEFAULT_NAME));
  const result = await renderReport(diary, output, {
    font: options.font,
    logo: options.logo || join(reportRoot, 'usjp.jpg'),
  });
  const incompleteWeeks = status.weeks
    .filter((week) => !week.complete)
    .map((week) => ({
      number: week.number,
      missing: week.missing,
      missingDays: week.missingDays,
      screenshots: week.screenshots.images.length,
      review: week.reviewed,
    }));
  const missing = {
    profile: status.profile.missing,
    requiredProfile: status.profile.requiredMissing,
    absencesConfirmed: status.absencesConfirmed,
    incompleteWeeks,
    reportInputs: [
      'University/faculty/department and course/degree',
      'Student number, field/role, and training location',
      'NAITA registration number if required',
      'Approved organization facts and image permissions',
      'Supervisor name/designation and certification details',
    ],
  };
  const missingCount =
    missing.profile.length + incompleteWeeks.length + missing.reportInputs.length + Number(!missing.absencesConfirmed);
  return {
    ...result,
    complete: status.complete && missingCount === 0,
    missing,
    message: `Created report ${result.path} (${result.pages} pages, ${result.figures} figures). ${missingCount} input/checklist areas still need review.`,
  };
}

export function formatReport(result) {
  const profile = result.missing.profile.length ? result.missing.profile.join(', ') : 'none';
  const weeks = result.missing.incompleteWeeks.length
    ? result.missing.incompleteWeeks.map((week) => week.number).join(', ')
    : 'none';
  return [
    result.message,
    `Profile fields still blank: ${profile}.`,
    `Diary weeks still needing completion/review: ${weeks}.`,
    'Report inputs still needed:',
    ...result.missing.reportInputs.map((item) => `  - ${item}`),
    `Editable report source: ${result.sourcePath}`,
  ].join('\n');
}
