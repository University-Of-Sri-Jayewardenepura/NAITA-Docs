import type { CliRenderer } from '@opentui/core';
import { PROFILE_FIELDS } from '../diary/profile.mts';
import { DiaryShell } from './shell';
import { WeekScreens } from './weeks';
import type { CommandRunner } from './client';
import { showChecklist } from './checklist';

export function createDiaryApp(renderer: CliRenderer, run: CommandRunner) {
  const ui = new DiaryShell(renderer);
  const weeks = new WeekScreens(ui, run, home);
  async function home() {
    const status = await run('status');
    ui.show(
      'NAITA internship diary',
      `Profile ${status.profile.filled}/${status.profile.total} | ${status.completedWeeks}/${status.weeks.length} weeks ready\nAbsences ${status.absencesConfirmed ? 'confirmed' : 'not confirmed'} | ${status.commits} commits imported\nChoose any step. Your saved work is kept when you come back.`,
      [
        { name: 'Student and training profile', description: 'Fill or change one field at a time', action: profile },
        {
          name: 'Weekly diary',
          description: 'Write points, review suggestions, and add screenshots',
          action: () => weeks.list(),
        },
        {
          name: 'Import Git history',
          description: 'Read a project here or elsewhere on your computer',
          action: importRepo,
        },
        {
          name: 'Leave and non-working dates',
          description: 'Confirm leave and medical dates, even when there are none',
          action: attendance,
        },
        {
          name: 'Checklist and screenshot plan',
          description: 'Write first; see what to capture and which week folder to use',
          action: () => showChecklist(ui, run, home),
        },
        {
          name: 'Export PDF',
          description: 'Create a draft or a completed diary using the supplied template',
          action: exportMenu,
        },
        { name: 'Refresh status', action: home },
        { name: 'Exit', action: () => renderer.destroy() },
      ],
      () => {},
    );
  }
  async function profile() {
    const config = await run('profile');
    ui.show(
      'Student and training profile',
      'Select any field to edit it. Set training dates before opening weekly entries.',
      Object.entries(PROFILE_FIELDS).map(([key, label]) => ({
        name: label,
        description: config[key] || 'Not filled in yet',
        action: () =>
          ui.form(
            label,
            [{ key: 'text', label, value: config[key], optional: true }],
            async ({ text }) => {
              await run('profile', { field: key, text });
              await profile();
            },
            profile,
          ),
      })),
      home,
    );
  }
  function importRepo() {
    ui.form(
      'Import Git history',
      [
        { key: 'repo', label: 'Path to the Git repository' },
        { key: 'author', label: 'Your Git author name or email (recommended in shared repositories)', optional: true },
      ],
      async (values) => {
        await run('import', values);
        await showChecklist(ui, run, home);
      },
      home,
    );
  }
  async function attendance() {
    const { absence } = await run('status');
    ui.form(
      'Attendance',
      [
        {
          key: 'leave',
          label: 'Authorized leave dates: YYYY-MM-DD or START..END; comma separated',
          value: (absence.leave || []).join(', '),
          optional: true,
        },
        {
          key: 'medical',
          label: 'Medical leave dates (blank for none)',
          value: (absence.medical || []).join(', '),
          optional: true,
        },
        {
          key: 'off',
          label: 'Additional holidays/non-working dates (blank for none)',
          value: (absence.off || []).join(', '),
          optional: true,
        },
      ],
      async (values) => {
        await run('absence', values);
        await home();
      },
      home,
    );
  }
  function exportMenu() {
    const exportPdf = (strict: boolean) =>
      ui.form(
        'Export PDF',
        [{ key: 'out', label: 'Output PDF path (blank for local/output/NAITA-Daily-Diary.pdf)', optional: true }],
        async ({ out }) => {
          const result = await run('generate', { strict, ...(out ? { out } : {}) });
          ui.show('PDF created', result.message, [{ name: 'Back to diary', action: home }], home);
        },
        exportMenu,
      );
    ui.show(
      'Export PDF',
      'Confirm absence dates first. A completed export also needs all weekly content and reviews.',
      [
        { name: 'Export a draft', action: () => exportPdf(false) },
        { name: 'Export completed diary', action: () => exportPdf(true) },
      ],
      home,
    );
  }
  return { start: () => ui.perform(home), home, ui };
}
