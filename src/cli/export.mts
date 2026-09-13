import { resolve, join } from 'node:path';
import { prepareDiary, draftWeeks } from '../diary/workflow.mts';
import { loadDiary, paths } from '../diary/store.mts';
import { validateProfile } from '../diary/profile.mts';
import { diaryStatus } from '../diary/status.mts';
import { renderDiary } from '../pdf/render.mts';
import { ask } from './profile.mts';

export async function generate(workspace, options) {
  const initial = loadDiary(workspace);
  validateProfile(initial.config);
  if (options['dry-run']) return prepareDiary(workspace, options, { persist: false });
  const attendance = { ...options };
  for (const key of ['leave', 'medical']) {
    if (initial.state.absence[key] === null && attendance[key] === undefined) {
      attendance[key] = await ask(
        `${key === 'leave' ? 'Authorized leave' : 'Medical leave'} dates/ranges (blank for none)`,
      );
    }
  }
  let diary = prepareDiary(workspace, attendance);
  if (options.agent || options['agent-command']) diary = await draftWeeks(workspace, options);
  const status = await diaryStatus(diary);
  if (options.strict && !status.complete)
    throw new Error(
      'Diary is not ready for final export. Run status to see missing entries, screenshots, suggestions, attendance, and reviews.',
    );
  const result = await renderDiary(
    diary,
    resolve(options.out || join(paths(workspace).output, 'NAITA-Daily-Diary.pdf')),
    options,
  );
  return {
    ...result,
    complete: status.complete,
    message: `Created ${status.complete ? '' : 'draft '}${result.path} (${result.pages} pages).${status.complete ? '' : ' Run status to see what still needs filling.'}`,
  };
}
