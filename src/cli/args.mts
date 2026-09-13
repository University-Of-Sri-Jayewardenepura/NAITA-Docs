import { parseArgs as parseNodeArgs } from 'node:util';

const shared = ['workspace', 'json', 'actor', 'reason'];
const commandOptions = {
  help: [],
  init: ['from'],
  profile: ['from', 'field', 'text'],
  status: ['week'],
  checklist: ['week'],
  history: ['week'],
  show: ['week'],
  weeks: [],
  import: ['repo', 'author', 'leave', 'medical', 'off'],
  absence: ['leave', 'medical', 'off'],
  add: ['week', 'section', 'date', 'text', 'before'],
  edit: ['week', 'section', 'date', 'text', 'id', 'remove'],
  draft: ['week', 'from', 'agent', 'agent-command'],
  accept: ['week', 'id', 'text', 'before', 'accept-drafts'],
  dismiss: ['week', 'id'],
  review: ['week'],
  screenshots: ['week', 'file', 'text', 'reason'],
  context: ['week', 'prompt'],
  'agent-guide': [],
  generate: [
    'repo',
    'author',
    'leave',
    'medical',
    'off',
    'out',
    'font',
    'template',
    'strict',
    'dry-run',
    'agent',
    'agent-command',
  ],
};
export function parseArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let [command = 'help', ...rest] = args;
  if (['-h', '--help'].includes(command) || rest.includes('--help')) return { command: 'help', options: {} };
  if (command === 'export') command = 'generate';
  if (!Object.hasOwn(commandOptions, command))
    throw new Error(`Unknown command: ${command}. Run help for the command list.`);
  const boolean = new Set(['json', 'strict', 'dry-run', 'remove', 'accept-drafts', 'prompt']);
  const definitions = Object.fromEntries(
    [...shared, ...commandOptions[command]].map((key) => [
      key,
      { type: boolean.has(key) ? 'boolean' : 'string', ...(key === 'repo' ? { multiple: true } : {}) },
    ]),
  );
  const { values } = parseNodeArgs({ args: rest, options: definitions, strict: true, allowPositionals: false });
  return { command, options: values };
}
