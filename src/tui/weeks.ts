import { SECTIONS } from '../diary/entries.mts';
import { DiaryShell, type Choice } from './shell';
import type { CommandRunner } from './client';
import { showChecklist } from './checklist';

export class WeekScreens {
  constructor(
    private ui: DiaryShell,
    private run: CommandRunner,
    private home: () => Promise<void>,
  ) {}

  async list() {
    const result = await this.run('weeks');
    const status = await this.run('status');
    this.ui.show(
      'Choose a week',
      `${status.completedWeeks}/${status.weeks.length} weeks ready. Open any week to continue.`,
      result.weeks.map((week: any) => {
        const progress = status.weeks.find((item: any) => item.number === week.number);
        return {
          name: `Week ${week.number} | ${week.monday} | ${progress.percent}% filled`,
          description: `${progress.screenshots.images.length} screenshots, ${progress.suggestions} suggestions, review ${progress.reviewed ? 'current' : 'needed'}`,
          action: () => this.week(week.number),
        };
      }),
      this.home,
    );
  }
  async week(number: number) {
    const status = await this.run('status', { week: String(number) });
    const progress = status.weeks[0];
    const missing = [...progress.missing, ...progress.missingDays];
    this.ui.show(
      `Week ${number} | ${progress.monday} to ${progress.sunday}`,
      `${progress.percent}% filled | ${progress.screenshots.images.length} screenshots | ${progress.suggestions} suggestions\n${missing.length ? 'Still needed: ' + missing.join(', ') : 'Content filled. Review it when you are ready.'}${progress.conflicts.length ? '\nAttendance conflicts: ' + progress.conflicts.join(', ') : ''}`,
      [
        ...Object.entries(SECTIONS).map(([section, label]) => ({
          name: `${label} (${progress.sections[section]} points)`,
          action: () => this.section(number, section),
        })),
        { name: 'Daily work', description: 'Add or edit a dated point', action: () => this.days(number) },
        {
          name: 'Suggestions',
          description: 'Draft, accept, answer, or dismiss',
          action: () => this.suggestions(number),
        },
        {
          name: 'Screenshots',
          description: 'View the folder, add captions, or mark not needed',
          action: () => this.screenshots(number),
        },
        {
          name: 'Mark this week reviewed',
          action: async () => {
            await this.run('review', { week: String(number) });
            await this.week(number);
          },
        },
      ],
      () => this.list(),
    );
  }
  async section(number: number, section: string, date?: string) {
    const week = await this.run('show', { week: String(number) });
    const points = date ? week.entry.days[date] : week.entry.sections[section];
    const target: Record<string, string> = date ? { date } : { section };
    const label = date || SECTIONS[section as keyof typeof SECTIONS];
    const back = () => (date ? this.days(number) : this.week(number));
    const list = () => this.section(number, section, date);
    const write = (id?: string, before?: string, text = '') =>
      this.ui.form(
        `${id ? 'Edit' : 'Add'} a point`,
        [{ key: 'text', label: label, value: text }],
        async (values) => {
          await this.run(id ? 'edit' : 'add', {
            week: String(number),
            ...target,
            text: values.text,
            ...(id ? { id } : {}),
            ...(before ? { before } : {}),
          });
          await list();
        },
        list,
      );
    const choices: Choice[] = [
      { name: 'Add a point', description: 'Write what you did in your own words', action: () => write() },
    ];
    for (const point of points)
      choices.push({
        name: point.text,
        description: 'Edit, insert before, or remove this point',
        action: () =>
          this.ui.show(
            label,
            point.text,
            [
              { name: 'Edit this point', action: () => write(point.id, undefined, point.text) },
              { name: 'Insert a point before this', action: () => write(undefined, point.id) },
              {
                name: 'Remove this point',
                action: async () => {
                  await this.run('edit', { week: String(number), ...target, id: point.id, remove: true });
                  await list();
                },
              },
            ],
            list,
          ),
      });
    this.ui.show(
      `Week ${number} | ${label}`,
      `Each entry is a bullet point. ${date ? 'Git descriptions fill the daily table until you customize it.' : 'Write about the whole week.'}\nManual file: ${week.file}`,
      choices,
      back,
    );
  }
  async days(number: number) {
    const week = await this.run('show', { week: String(number) });
    this.ui.show(
      `Week ${number} | Daily work`,
      'Attendance is set from the home menu.',
      week.days
        .filter((day: any) => day.status === 'work')
        .map((day: any) => ({
          name: day.date,
          description: `${day.commits.length} commits; ${week.entry.days[day.date].length} saved points`,
          action: () => this.section(number, 'work', day.date),
        })),
      () => this.week(number),
    );
  }
  async suggestions(number: number) {
    const week = await this.run('show', { week: String(number) });
    const back = () => this.suggestions(number);
    const choices: Choice[] = [
      {
        name: 'Prepare suggestions from Git history',
        action: async () => {
          await this.run('draft', { week: String(number) });
          await back();
        },
      },
    ];
    for (const suggestion of week.entry.suggestions)
      choices.push({
        name: `${suggestion.section}: ${suggestion.text}`,
        description: suggestion.kind === 'question' ? 'Your answer is needed' : 'Suggested wording for review',
        action: () => {
          const actions: Choice[] = [
            {
              name: suggestion.kind === 'question' ? 'Answer and add to the diary' : 'Edit wording and accept',
              action: () =>
                this.ui.form(
                  'Your diary point',
                  [
                    {
                      key: 'text',
                      label: suggestion.text,
                      value: suggestion.kind === 'question' ? '' : suggestion.text,
                    },
                  ],
                  async ({ text }) => {
                    await this.run('accept', { week: String(number), id: suggestion.id, text });
                    await back();
                  },
                  back,
                ),
            },
          ];
          if (suggestion.kind === 'draft')
            actions.push({
              name: 'Accept this wording',
              action: async () => {
                await this.run('accept', { week: String(number), id: suggestion.id });
                await back();
              },
            });
          actions.push({
            name: 'Dismiss',
            action: async () => {
              await this.run('dismiss', { week: String(number), id: suggestion.id });
              await back();
            },
          });
          this.ui.show('Review suggestion', `${suggestion.text}\n${suggestion.reason}`, actions, back);
        },
      });
    this.ui.show(
      `Week ${number} | Suggestions`,
      'Only accepted points appear in your diary. Answer questions from your own experience.',
      choices,
      () => this.week(number),
    );
  }
  async screenshots(number: number) {
    const result = await this.run('screenshots', { week: String(number) });
    const back = () => this.screenshots(number);
    const choices: Choice[] = [
      {
        name: 'What screenshots should I add? (checklist)',
        action: () => showChecklist(this.ui, this.run, back, number),
      },
      { name: 'Refresh folder', action: back },
      {
        name: 'Set or clear a reason for no screenshots',
        action: () =>
          this.ui.form(
            'Screenshots not needed',
            [
              {
                key: 'reason',
                label: 'Reason (clear it to require screenshots again)',
                value: result.notRequiredReason,
                optional: true,
              },
            ],
            async ({ reason }) => {
              await this.run('screenshots', { week: String(number), reason });
              await back();
            },
            back,
          ),
      },
    ];
    for (const image of result.images)
      choices.push({
        name: image.name,
        description: image.caption,
        action: () =>
          this.ui.form(
            'Screenshot caption',
            [{ key: 'text', label: 'Briefly explain what the image shows', value: image.caption }],
            async ({ text }) => {
              await this.run('screenshots', { week: String(number), file: image.name, text });
              await back();
            },
            back,
          ),
      });
    this.ui.show(
      `Week ${number} | Screenshots`,
      `Put PNG or JPEG files here, then refresh:\n${result.folder}\n${result.errors.join('; ')}${result.ignored.length ? '\nUnsupported: ' + result.ignored.join(', ') : ''}`,
      choices,
      () => this.week(number),
    );
  }
}
