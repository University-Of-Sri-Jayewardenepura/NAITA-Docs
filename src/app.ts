#!/usr/bin/env bun

import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';
import { generate, loadConfig, saveConfig } from './cli.mjs';

type Field = {
  key: string;
  label: string;
  hint: string;
  optional?: boolean;
  config?: boolean;
};

const fields: Field[] = [
  { key: 'name', label: 'Student name', hint: 'As it should appear in the apprentice diary.', config: true },
  { key: 'privateAddress', label: 'Private address', hint: 'Student contact address.', optional: true, config: true },
  { key: 'phone', label: 'Contact phone number', hint: 'Student contact number.', optional: true, config: true },
  { key: 'category', label: 'Category', hint: 'For example: Undergraduate or Diploma.', optional: true, config: true },
  { key: 'field', label: 'Field / trade of training', hint: 'For example: Information and Communication Technology.', optional: true, config: true },
  { key: 'instituteRegistration', label: 'University/institute registration number', hint: 'Optional.', optional: true, config: true },
  { key: 'naitaRegistration', label: 'NAITA registration number', hint: 'Optional.', optional: true, config: true },
  { key: 'establishment', label: 'Training establishment', hint: 'Company or organisation name.', config: true },
  { key: 'trainingLocation', label: 'Default training location', hint: 'Usually the office, site, or establishment name.', optional: true, config: true },
  { key: 'trainingStart', label: 'Training start', hint: 'Required format: YYYY-MM-DD.', config: true },
  { key: 'trainingEnd', label: 'Training end', hint: 'Required format: YYYY-MM-DD.', config: true },
  { key: 'repo', label: 'Student Git repository', hint: 'Absolute or relative path to the repository.' },
  { key: 'leave', label: 'Authorized leave dates', hint: 'Optional. Example: 2026-04-10, 2026-04-20..2026-04-22', optional: true },
  { key: 'medical', label: 'Medical leave dates', hint: 'Optional. Same date/range format as leave.', optional: true },
  { key: 'agent', label: 'Writing agent', hint: 'Optional: enter codex or claude. Leave blank to use commit subjects.', optional: true },
];

const initial = loadConfig(false) || {};
const values: Record<string, string> = Object.fromEntries(fields.map((field) => [field.key, String(initial[field.key] || '')]));

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    consoleMode: 'disabled',
    backgroundColor: '#10131a',
  });

  const panel = new BoxRenderable(renderer, {
    id: 'naita-diary', width: 76, maxWidth: '100%', height: 16, borderStyle: 'rounded', borderColor: '#5f89c7',
    title: ' NAITA Daily Diary ', titleAlignment: 'center', padding: 2, gap: 1, flexDirection: 'column',
  });
  const progress = new TextRenderable(renderer, { id: 'progress', content: '', fg: '#7fdbff' });
  const label = new TextRenderable(renderer, { id: 'label', content: '', fg: '#ffffff', attributes: TextAttributes.BOLD });
  const hint = new TextRenderable(renderer, { id: 'hint', content: '', fg: '#a5b3c6' });
  const fieldInput = new InputRenderable(renderer, {
    id: 'value', width: '100%', placeholder: '', backgroundColor: '#202838', focusedBackgroundColor: '#2b3850', textColor: '#ffffff', cursorColor: '#7fdbff',
  });
  const footer = new TextRenderable(renderer, { id: 'footer', content: 'Enter: next  •  Ctrl+C: cancel', fg: '#7d8798' });
  const status = new TextRenderable(renderer, { id: 'status', content: 'The PDF template is static; generated text is embedded in Times New Roman.', fg: '#76d7a2' });
  panel.add(progress); panel.add(label); panel.add(hint); panel.add(fieldInput); panel.add(status); panel.add(footer);
  renderer.root.add(panel);

  let index = 0;
  let busy = false;
  const show = () => {
    const field = fields[index];
    progress.content = `Step ${index + 1} of ${fields.length}  ·  ${field.config ? 'Profile' : index < 12 ? 'Git history' : 'Absence and wording'}`;
    label.content = `${field.label}${field.optional ? ' (optional)' : ''}`;
    hint.content = field.hint;
    fieldInput.placeholder = field.optional ? 'Leave blank if not applicable' : 'Type a value and press Enter';
    fieldInput.value = values[field.key] || '';
    status.content = 'Press Enter to save this value and continue.';
    status.fg = '#76d7a2';
    fieldInput.focus();
  };

  const finish = async () => {
    busy = true;
    label.content = 'Creating your diary…';
    hint.content = 'Reading Git history, applying leave/medical dates, and writing the PDF.';
    status.content = 'This may take a moment.';
    try {
      const config = Object.fromEntries(fields.filter((field) => field.config).map((field) => [field.key, values[field.key]]));
      saveConfig(config);
      const agent = values.agent.trim().toLowerCase();
      if (agent && agent !== 'codex' && agent !== 'claude') throw new Error('Writing agent must be codex, claude, or blank.');
      await generate({ repo: values.repo, leave: values.leave, medical: values.medical, ...(agent ? { agent } : {}) });
      renderer.destroy();
      console.log('Created output/NAITA-Daily-Diary.pdf');
    } catch (error) {
      status.content = `Error: ${error instanceof Error ? error.message : String(error)}`;
      status.fg = '#ff8a8a';
      busy = false;
      fieldInput.focus();
    }
  };

  fieldInput.on(InputRenderableEvents.ENTER, (value: string) => {
    if (busy) return;
    const field = fields[index];
    if (!field.optional && !value.trim()) {
      status.content = `${field.label} is required.`;
      status.fg = '#ff8a8a';
      return;
    }
    values[field.key] = value.trim();
    if (index === fields.length - 1) void finish();
    else { index += 1; show(); }
  });
  show();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
