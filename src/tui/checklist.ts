import { DiaryShell } from './shell';
import { basename } from 'node:path';
import type { CommandRunner } from './client';

export async function showChecklist(ui: DiaryShell, run: CommandRunner, back: () => Promise<void>, number?: number) {
  const plan = await run('checklist', number ? { week: String(number) } : {});
  const again = () => showChecklist(ui, run, back, number);
  const week = number ? plan.weeks[0] : undefined;
  const tasks = week ? week.tasks : plan.tasks;
  ui.show(
    week ? `Week ${number} | Screenshot checklist` : 'Checklist | screenshots last',
    week
      ? `Week folder: ${basename(week.folder)}\n${week.folder}\nWrite first; add screenshots last. Choose a capture idea below.`
      : `Finish writing, add screenshots last, then review/export.\nSaved guide: ${plan.path}`,
    [
      ...tasks.map((task: any) => ({
        name: `[${task.done ? 'x' : ' '}] ${task.label}`,
        description: task.detail,
        action: () =>
          ui.show(
            task.label,
            `${task.detail}\nCLI: bun run cli -- ${task.command}`,
            [{ name: 'Back to checklist', action: again }],
            again,
          ),
      })),
      ...(week
        ? week.ideas.map((idea: any) => ({
            name: `Capture idea: ${idea.activity}`,
            description:
              idea.source === 'git' ? `Git evidence: ${idea.dates.join(', ')}` : 'Student-supplied work note',
            action: () =>
              ui.show(
                'What to capture (optional)',
                `${idea.capture}\nSave in: ${week.folder}`,
                [
                  {
                    name: `Suggested filename: ${idea.filename}`,
                    description: 'PNG/JPEG filenames are optional; review the actual image content.',
                    action: () =>
                      ui.show(
                        'Capture source',
                        `${idea.activity}\n${idea.evidence.join(', ')}\n${idea.repos.join('; ')}`,
                        [{ name: 'Back to checklist', action: again }],
                        again,
                      ),
                  },
                  { name: 'Back to checklist', action: again },
                ],
                again,
              ),
          }))
        : plan.weeks.map((item: any) => ({
            name: `Week ${item.number} | ${item.monday} | ${item.ideas.length} capture ideas`,
            description: item.folder,
            action: () => showChecklist(ui, run, again, item.number),
          }))),
      { name: 'Refresh checklist', action: again },
      { name: 'Back', action: back },
    ],
    back,
  );
}
