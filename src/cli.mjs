#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'naita-diary.json');
const TEMPLATE_PATH = join(ROOT, 'Daily Diary.pdf');
const DEFAULT_OUTPUT = join(ROOT, 'output', 'NAITA-Daily-Diary.pdf');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const part = rest[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    if (key === 'dry-run') options.dryRun = true;
    else options[key] = rest[++i];
  }
  return { command, options };
}

function usage() {
  console.log(`NAITA diary CLI

Commands:
  init                         Collect and save student/training information.
  generate --repo PATH         Create the diary PDF from a Git repository.
  help                         Show this help.

Generate options:
  --out PATH                   Output PDF path (default: output/NAITA-Daily-Diary.pdf)
  --leave DATES                Authorized leave dates/ranges (comma-separated)
  --medical DATES              Medical leave dates/ranges (comma-separated)
  --agent codex|claude         Use an installed Codex or Claude CLI for wording
  --agent-command COMMAND      Use a custom agent command, receiving prompt on stdin
  --dry-run                    Produce the calendar JSON but do not write a PDF`);
}

async function ask(question, defaultValue = '') {
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue;
}

async function initConfig() {
  const existing = loadConfig(false) || {};
  console.log('Enter the information shown on page 2 of the diary.');
  const config = {
    name: await ask('Student name', existing.name),
    privateAddress: await ask('Private address', existing.privateAddress),
    phone: await ask('Contact phone number', existing.phone),
    category: await ask('Category', existing.category),
    field: await ask('Field/trade of training', existing.field),
    instituteRegistration: await ask('University/institute registration number', existing.instituteRegistration),
    naitaRegistration: await ask('NAITA registration number', existing.naitaRegistration),
    establishment: await ask('Training establishment name', existing.establishment),
    trainingLocation: await ask('Default training location', existing.trainingLocation || existing.establishment),
    trainingStart: await ask('Training start (YYYY-MM-DD)', existing.trainingStart),
    trainingEnd: await ask('Training end (YYYY-MM-DD)', existing.trainingEnd),
  };
  validateConfig(config);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Saved ${CONFIG_PATH}`);
}

function loadConfig(required = true) {
  if (!existsSync(CONFIG_PATH)) {
    if (required) throw new Error('No naita-diary.json found. Run `npx naita-diary init` first.');
    return null;
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function validateConfig(config) {
  for (const key of ['name', 'establishment', 'trainingStart', 'trainingEnd']) {
    if (!config[key]) throw new Error(`${key} is required.`);
  }
  for (const key of ['trainingStart', 'trainingEnd']) {
    if (!DATE_RE.test(config[key]) || Number.isNaN(Date.parse(`${config[key]}T00:00:00Z`))) {
      throw new Error(`${key} must be YYYY-MM-DD.`);
    }
  }
  if (config.trainingStart > config.trainingEnd) throw new Error('Training start must be before training end.');
}

function saveConfig(config) {
  validateConfig(config);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function parseDateList(value) {
  const dates = new Set();
  if (!value?.trim()) return dates;
  for (const entry of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [start, end = start] = entry.split('..').map((item) => item.trim());
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      throw new Error(`Invalid date or range: ${entry}. Use YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD.`);
    }
    for (let day = utcDate(start); isoDate(day) <= end; day = addDays(day, 1)) dates.add(isoDate(day));
  }
  return dates;
}

function utcDate(value) { return new Date(`${value}T00:00:00Z`); }
function isoDate(value) { return value.toISOString().slice(0, 10); }
function addDays(value, count) { const copy = new Date(value); copy.setUTCDate(copy.getUTCDate() + count); return copy; }
function displayDate(value) { const date = utcDate(value); return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`; }

function gitHistory(repo, start, end) {
  const result = spawnSync('git', ['log', '--all', '--no-merges', '--date=short', '--pretty=format:%H%x1f%ad%x1f%s%x1f%b%x1e', '--since', `${start}T00:00:00`, '--until', `${end}T23:59:59`], {
    cwd: repo, encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Could not read Git history.');
  return result.stdout.split('\x1e').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [hash, date, subject, body] = row.split('\x1f');
    return { hash, date, subject: subject.trim(), body: body.trim() };
  });
}

function calendar(config, commits, leaveDates, medicalDates) {
  const byDate = new Map();
  for (const commit of commits) {
    if (!byDate.has(commit.date)) byDate.set(commit.date, []);
    byDate.get(commit.date).push(commit);
  }
  const first = utcDate(config.trainingStart);
  const last = utcDate(config.trainingEnd);
  const firstMonday = addDays(first, -((first.getUTCDay() + 6) % 7));
  const weeks = [];
  for (let monday = firstMonday; monday <= last; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = isoDate(addDays(monday, index));
      const inPeriod = date >= config.trainingStart && date <= config.trainingEnd;
      const status = !inPeriod ? 'outside' : leaveDates.has(date) ? 'leave' : medicalDates.has(date) ? 'medical' : 'work';
      return { date, inPeriod, status, commits: byDate.get(date) || [], text: '' };
    });
    weeks.push({ number: weeks.length + 1, monday: isoDate(monday), sunday: isoDate(addDays(monday, 6)), days, summary: '' });
  }
  return weeks;
}

function defaultText(day) {
  if (!day.inPeriod) return '';
  if (day.status === 'leave') return 'Authorized leave.';
  if (day.status === 'medical') return 'Medical leave.';
  if (!day.commits.length) return 'No Git work recorded.';
  const subjects = [...new Set(day.commits.map((commit) => commit.subject.replace(/^\[[^\]]+\]\s*/, '')))];
  return subjects.join('; ').slice(0, 220);
}

function applyDefaultText(weeks) {
  for (const week of weeks) {
    for (const day of week.days) day.text = defaultText(day);
    const worked = week.days.filter((day) => day.status === 'work' && day.commits.length).flatMap((day) => day.commits.map((commit) => commit.subject));
    week.summary = worked.length ? [...new Set(worked)].join('; ').slice(0, 1200) : 'No Git work was recorded for this week.';
  }
}

function agentPrompt(weeks) {
  return `You are preparing a factual NAITA industrial-training diary from Git history. Return JSON only, with this exact shape:\n{"days":{"YYYY-MM-DD":"one concise past-tense work description"},"weeks":{"YYYY-MM-DD":"factual weekly summary"}}\n\nRules:\n- Only describe work supported by the supplied commits. Do not invent meetings, testing, hours, technologies, or outcomes.\n- Do not provide text for leave or medical dates.\n- Keep each day under 180 characters and each week under 900 characters.\n- Use clear professional language in the past tense.\n\nInput:\n${JSON.stringify(weeks.map((week) => ({ weekEnding: week.sunday, days: week.days.map((day) => ({ date: day.date, status: day.status, commits: day.commits.map(({ hash, subject, body }) => ({ hash: hash.slice(0, 8), subject, body })) })) })), null, 2)}`;
}

function runAgent(command, weeks, repo) {
  const result = spawnSync(command, { cwd: repo, input: agentPrompt(weeks), encoding: 'utf8', shell: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Agent command failed.');
  const text = result.stdout.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Agent response did not include JSON.');
  let response;
  try { response = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('Agent response was not valid JSON.'); }
  for (const week of weeks) {
    for (const day of week.days) {
      if (day.status === 'work' && response.days?.[day.date]) day.text = String(response.days[day.date]).slice(0, 220);
    }
    if (response.weeks?.[week.sunday]) week.summary = String(response.weeks[week.sunday]).slice(0, 1200);
  }
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').replace(/\s+/g, ' ').trim().split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page, text, x, y, width, size, font, maxLines = Infinity) {
  const lines = wrap(text, font, size, width).slice(0, maxLines);
  for (let index = 0; index < lines.length; index += 1) page.drawText(lines[index], { x, y: y - index * (size + 1.5), size, font, color: rgb(0, 0, 0) });
}

function addTemplatePage(output, embedded) {
  const page = output.addPage([595.32, 841.92]);
  page.drawPage(embedded, { x: 0, y: 0, width: 595.32, height: 841.92 });
  return page;
}

function drawInfo(page, config, font) {
  const entries = [
    ['name', 94, 710, 10, 425], ['privateAddress', 207, 690, 9, 310], ['phone', 176, 670, 10, 340],
    ['category', 125, 650, 10, 390], ['field', 172, 630, 10, 343], ['instituteRegistration', 349, 610, 9, 166],
    ['naitaRegistration', 264, 590, 10, 250], ['establishment', 242, 570, 10, 273],
  ];
  for (const [key, x, y, size, width] of entries) drawWrapped(page, config[key], x, y, width, size, font, 1);
  page.drawText(displayDate(config.trainingStart), { x: 255, y: 549, size: 9, font });
  page.drawText(displayDate(config.trainingEnd), { x: 370, y: 549, size: 9, font });
}

function drawWeek(page, week, config, font) {
  page.drawText(String(week.number), { x: 300, y: 771, size: 10, font });
  page.drawText(displayDate(week.sunday), { x: 132, y: 720, size: 9, font });
  drawWrapped(page, config.trainingLocation || config.establishment, 226, 720, 290, 8.5, font, 1);
  const rowY = [640, 563, 486, 423, 348, 273, 197];
  for (let index = 0; index < week.days.length; index += 1) {
    const day = week.days[index];
    if (!day.inPeriod) continue;
    page.drawText(displayDate(day.date), { x: 119, y: rowY[index], size: 7.5, font });
    drawWrapped(page, day.text, 169, rowY[index] + 4, 395, 8, font, 4);
  }
}

function drawDetails(page, week, font) {
  const detail = week.days.filter((day) => day.inPeriod).map((day) => `${displayDate(day.date)} — ${day.text}`).join('\n');
  let y = 704;
  for (const paragraph of detail.split('\n')) {
    const lines = wrap(paragraph, font, 9.5, 485);
    for (const line of lines) { page.drawText(line, { x: 55, y, size: 9.5, font }); y -= 14; }
    y -= 3;
    if (y < 125) break;
  }
}

async function render(config, weeks, outputPath) {
  if (!existsSync(TEMPLATE_PATH)) throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  const timesPath = 'C:\\Windows\\Fonts\\times.ttf';
  if (!existsSync(timesPath)) throw new Error('Times New Roman (times.ttf) was not found in C:\\Windows\\Fonts.');
  const source = await PDFDocument.load(readFileSync(TEMPLATE_PATH));
  const outputPdf = await PDFDocument.create();
  outputPdf.registerFontkit(fontkit);
  const font = await outputPdf.embedFont(readFileSync(timesPath), { subset: true });
  const templates = await outputPdf.embedPdf(source, source.getPageIndices());

  addTemplatePage(outputPdf, templates[0]);
  const info = addTemplatePage(outputPdf, templates[1]);
  drawInfo(info, config, font);
  for (const week of weeks) {
    const weekly = addTemplatePage(outputPdf, templates[2]);
    drawWeek(weekly, week, config, font);
    const details = addTemplatePage(outputPdf, templates[3]);
    drawDetails(details, week, font);
    addTemplatePage(outputPdf, templates[4]);
  }
  for (let index = 5; index < templates.length; index += 1) addTemplatePage(outputPdf, templates[index]);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, await outputPdf.save());
}

async function generate(options) {
  const config = loadConfig();
  validateConfig(config);
  const repo = resolve(options.repo || '');
  if (!options.repo || !existsSync(repo)) throw new Error('Provide an existing student repository with --repo PATH.');
  const leaveInput = options.leave ?? await ask('Authorized leave dates/ranges (blank if none)');
  const medicalInput = options.medical ?? await ask('Medical leave dates/ranges (blank if none)');
  const leaves = parseDateList(leaveInput);
  const medical = parseDateList(medicalInput);
  for (const date of medical) if (leaves.has(date)) throw new Error(`${date} is listed as both leave and medical.`);
  const commits = gitHistory(repo, config.trainingStart, config.trainingEnd);
  const weeks = calendar(config, commits, leaves, medical);
  applyDefaultText(weeks);
  let agentCommand = options['agent-command'];
  if (!agentCommand && options.agent === 'codex') agentCommand = 'codex exec --skip-git-repo-check --sandbox read-only';
  if (!agentCommand && options.agent === 'claude') agentCommand = 'claude -p';
  if (options.agent && !['codex', 'claude'].includes(options.agent)) throw new Error('--agent must be codex or claude.');
  if (agentCommand) runAgent(agentCommand, weeks, repo);
  if (options.dryRun) { console.log(JSON.stringify({ config, leaveDates: [...leaves], medicalDates: [...medical], commits, weeks }, null, 2)); return; }
  const out = resolve(options.out || DEFAULT_OUTPUT);
  await render(config, weeks, out);
  console.log(`Created ${out}`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h') return usage();
  if (command === 'init') return initConfig();
  if (command === 'generate') return generate(options);
  throw new Error(`Unknown command: ${command}`);
}

export { CONFIG_PATH, generate, loadConfig, saveConfig, validateConfig };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}
