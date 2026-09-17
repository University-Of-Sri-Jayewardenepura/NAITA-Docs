import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { embedImage } from './images.mts';
import { embedTimesFamily } from './fonts.mts';
import { drawText, printable, wrap } from './layout.mts';
import { scanScreenshots } from '../diary/screenshots.mts';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 12;
const LEADING = 18;
const BOTTOM = 58;

function ascii(value) {
  return printable(value)
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function writeAtomic(path, bytes, options) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, bytes, options);
  renameSync(temp, path);
}

function addPage(pdf, fonts) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const number = pdf.getPageCount();
  const text = String(number);
  drawText(page, text, (PAGE_WIDTH - fonts.regular.widthOfTextAtSize(text, 10)) / 2, 30, 10, fonts.regular);
  return page;
}

function centered(page, text, y, size, font) {
  const value = ascii(text);
  drawText(page, value, (PAGE_WIDTH - font.widthOfTextAtSize(value, size)) / 2, y, size, font);
}

function frontPage(pdf, fonts, title, paragraphs) {
  const page = addPage(pdf, fonts);
  centered(page, title, 770, 14, fonts.bold);
  let y = 726;
  for (const paragraph of paragraphs) {
    const lines = wrap(ascii(paragraph), fonts.regular, BODY_SIZE, CONTENT_WIDTH);
    for (const line of lines) {
      drawText(page, line, MARGIN, y, BODY_SIZE, fonts.regular);
      y -= LEADING;
    }
    y -= 10;
  }
  return page;
}

class ReportWriter {
  constructor(pdf, fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
    this.page = null;
    this.y = 0;
  }
  pageNumber() {
    return this.pdf.getPageCount();
  }
  newPage() {
    this.page = addPage(this.pdf, this.fonts);
    this.y = PAGE_HEIGHT - MARGIN;
  }
  ensure(height = LEADING) {
    if (this.y - height < BOTTOM) this.newPage();
  }
  line(text, { font = this.fonts.regular, size = BODY_SIZE, x = MARGIN, leading = LEADING } = {}) {
    this.ensure(leading);
    drawText(this.page, ascii(text), x, this.y, size, font);
    this.y -= leading;
  }
  paragraph(text) {
    const paragraphs = String(text)
      .split(/\n\s*\n/)
      .filter(Boolean);
    for (const value of paragraphs) {
      const lines = wrap(ascii(value), this.fonts.regular, BODY_SIZE, CONTENT_WIDTH);
      for (const line of lines) this.line(line);
      this.y -= 9;
    }
  }
  bullet(text) {
    const lines = wrap(ascii(text), this.fonts.regular, BODY_SIZE, CONTENT_WIDTH - 18);
    for (const [index, line] of lines.entries()) {
      this.ensure(LEADING);
      if (index === 0) drawText(this.page, '-', MARGIN, this.y, BODY_SIZE, this.fonts.regular);
      drawText(this.page, line, MARGIN + 18, this.y, BODY_SIZE, this.fonts.regular);
      this.y -= LEADING;
    }
    this.y -= 4;
  }
  heading(text, level = 2, pages) {
    const size = level === 1 ? 14 : 12;
    const gap = level === 1 ? 0 : 6;
    if (level === 1) this.newPage();
    else this.ensure(LEADING * 2);
    this.y -= gap;
    const page = this.pageNumber();
    this.line(text, { font: this.fonts.bold, size, leading: level === 1 ? 24 : 21 });
    this.y -= level === 1 ? 12 : 4;
    if (pages) pages.set(text, page);
    return page;
  }
  async figure(image, number, caption) {
    const bytes = readFileSync(image.path);
    const embedded = await embedImage(this.pdf, bytes, image.kind);
    const maxWidth = CONTENT_WIDTH - 18;
    const maxHeight = 260;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const captionLines = wrap(`${number}. ${caption}`, this.fonts.regular, 10.5, CONTENT_WIDTH);
    const required = height + captionLines.length * 14 + 28;
    if (this.y - required < BOTTOM) this.newPage();
    const page = this.pageNumber();
    this.page.drawImage(embedded, {
      x: MARGIN + (CONTENT_WIDTH - width) / 2,
      y: this.y - height,
      width,
      height,
    });
    this.y -= height + 12;
    for (const line of captionLines) {
      this.ensure(14);
      drawText(this.page, line, MARGIN, this.y, 10.5, this.fonts.regular);
      this.y -= 14;
    }
    this.y -= 12;
    return page;
  }
}

function pointTexts(weeks, section) {
  return weeks.flatMap((week) => (week.entry.sections[section] || []).map((point) => point.text));
}

function workTexts(weeks) {
  return pointTexts(weeks, 'work');
}

function rangeText(weeks) {
  if (!weeks.length) return '';
  return `Weeks ${weeks[0].number}-${weeks[weeks.length - 1].number} (${weeks[0].monday} to ${weeks[weeks.length - 1].sunday})`;
}

function group(weeks, start, end) {
  return weeks.slice(start, end);
}

function buildReportSource(diary, figures) {
  const { config, weeks } = diary;
  const groups = [
    ['Foundation and familiarisation', group(weeks, 0, 5)],
    ['Product feature development', group(weeks, 5, 10)],
    ['Documentation, media, and UI quality', group(weeks, 10, 15)],
    ['AI, privacy, tooling, and migration', group(weeks, 15, 20)],
    ['Leave period', group(weeks, 20, 22)],
    ['Navigation, recruitment, and dashboards', group(weeks, 22, 30)],
  ];
  const lines = [
    '# Industrial training report source',
    '',
    `Name: ${config.name || '[TO BE PROVIDED]'}`,
    `Training establishment: ${config.establishment || '[TO BE PROVIDED]'}`,
    `Training period: ${config.trainingStart || '[TO BE PROVIDED]'} to ${config.trainingEnd || '[TO BE PROVIDED]'}`,
    'Student number: [TO BE PROVIDED]',
    'Course/degree: [TO BE PROVIDED]',
    'Field/role: [TO BE PROVIDED]',
    '',
    '## Confirmed gaps',
    '',
    '- Private address, phone, category, institute registration, NAITA registration, and training location are not present in the diary profile.',
    '- University/faculty/department formatting rules and supervisor details are not present in the local data.',
    '',
    '## Chapter 1 - Training organization',
    '',
    'Only the establishment name is confirmed by the profile. Add approved Creative Software facts, services, organization information, and sources before submission.',
    '',
    '## Chapter 2 - Training experience',
    '',
  ];
  for (const [title, items] of groups) {
    lines.push(`### ${title}`);
    lines.push(rangeText(items));
    for (const text of workTexts(items)) lines.push(`- ${text}`);
    lines.push('');
  }
  lines.push('## Figures');
  lines.push('');
  for (const figure of figures) lines.push(`- ${figure.caption} (${figure.path})`);
  lines.push('');
  lines.push('## Chapter 3 - Conclusion');
  lines.push('');
  lines.push(
    'Draft conclusion, skills, SWOT analysis, and improvement plan from the learning and improvement sections after trainee review.',
  );
  return `${lines.join('\n')}\n`;
}

function addSection(writer, pages, title, paragraphs = [], bullets = []) {
  writer.heading(title, 2, pages);
  for (const paragraph of paragraphs) writer.paragraph(paragraph);
  for (const bullet of bullets) writer.bullet(bullet);
}

function imageKind(bytes) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'png' : 'jpg';
}

async function drawCover(pdf, fonts, logoPath, config) {
  const page = addPage(pdf, fonts);
  centered(page, 'National Apprenticeship & Industrial Training', 780, 18, fonts.bold);
  centered(page, 'Authority', 754, 18, fonts.bold);
  centered(page, 'Report on Industrial Training', 688, 16, fonts.bold);
  centered(page, 'At', 658, 13, fonts.regular);
  centered(page, config.establishment || '[TO BE PROVIDED]', 632, 16, fonts.bold);
  if (logoPath && existsSync(logoPath)) {
    const bytes = readFileSync(logoPath);
    const embedded = await embedImage(pdf, bytes, imageKind(bytes));
    const size = 130;
    page.drawImage(embedded, { x: (PAGE_WIDTH - size) / 2, y: 472, width: size, height: size });
  }
  centered(page, 'University of Sri Jayewardenepura', 435, 14, fonts.regular);
  centered(page, 'Nugegoda', 410, 13, fonts.regular);
  const rows = [
    ['Name', config.name || '[TO BE PROVIDED]'],
    ['Student No', '[TO BE PROVIDED]'],
    ['Course', '[TO BE PROVIDED]'],
    ['Field', '[TO BE PROVIDED]'],
    ['Training Period', `${config.trainingStart || '[TO BE PROVIDED]'} - ${config.trainingEnd || '[TO BE PROVIDED]'}`],
  ];
  let y = 302;
  for (const [label, value] of rows) {
    drawText(page, label, 92, y, 12, fonts.regular);
    drawText(page, ':', 180, y, 12, fonts.regular);
    drawText(page, ascii(value), 220, y, 12, fonts.regular);
    y -= 24;
  }
  return page;
}

function drawListPage(page, title, entries, fonts) {
  centered(page, title, 770, 14, fonts.bold);
  let y = 730;
  for (const entry of entries) {
    const label = ascii(entry.label);
    const pageText = String(entry.page);
    if (!pageText || pageText === 'undefined') {
      drawText(page, label, MARGIN, y, 11, fonts.regular);
      y -= 19;
      continue;
    }
    const pageWidth = fonts.regular.widthOfTextAtSize(pageText, 11);
    const labelWidth = fonts.regular.widthOfTextAtSize(label, 11);
    const dotsWidth = Math.max(30, CONTENT_WIDTH - labelWidth - pageWidth - 24);
    const dots = '.'.repeat(Math.max(4, Math.floor(dotsWidth / fonts.regular.widthOfTextAtSize('.', 11))));
    drawText(page, label, MARGIN, y, 11, fonts.regular);
    drawText(page, dots, MARGIN + labelWidth + 8, y, 11, fonts.regular);
    drawText(page, pageText, PAGE_WIDTH - MARGIN - pageWidth, y, 11, fonts.regular);
    y -= 19;
  }
}

export async function renderReport(diary, outputPath, options = {}) {
  const target = resolve(outputPath);
  if (!target.toLowerCase().endsWith('.pdf')) throw new Error('Report output filename must end with .pdf.');
  const pdf = await PDFDocument.create();
  const fonts = await embedTimesFamily(pdf, options.font);
  const config = diary.config;
  const reportRoot = join(dirname(target), '..');
  const logoPath = resolve(options.logo || join(reportRoot, 'usjp.jpg'));
  const screenshots = [];
  const screenshotWarnings = [];
  for (const week of diary.weeks) {
    const result = await scanScreenshots(week);
    screenshots.push(...result.images.map((image) => ({ ...image, week: week.number })));
    screenshotWarnings.push(...result.errors, ...result.ignored.map((name) => `${week.number}: ignored ${name}`));
  }
  const sourcePath = join(reportRoot, 'drafts', 'NAITA-Industrial-Training-Report-Pruthivi-Thejan-source.md');
  if (!existsSync(sourcePath))
    writeAtomic(sourcePath, Buffer.from(buildReportSource(diary, screenshots)), { mode: 0o600 });

  await drawCover(pdf, fonts, existsSync(logoPath) ? logoPath : '', config);
  frontPage(pdf, fonts, 'ACKNOWLEDGEMENT', [
    'This report records the industrial training experience of Pruthivi Thejan at Creative Software from 16 February 2026 to 11 September 2026.',
    'I am grateful to the University of Sri Jayewardenepura, the National Apprenticeship and Industrial Training Authority, and the staff members who supported the training programme.',
    'The names of supervisors, coordinators, and other contributors will be added after they are confirmed by the trainee. This draft does not invent personal acknowledgements.',
  ]);
  frontPage(pdf, fonts, 'PREFACE', [
    'Industrial training provides an opportunity to connect academic learning with professional software development. This report has been prepared as a record of the work, learning, challenges, and reflections captured during the training period.',
    `The available diary records cover ${config.trainingStart || '[start date]'} to ${config.trainingEnd || '[end date]'} at ${config.establishment || '[training establishment]'}. The course, field, student number, and placement location are still missing from the local profile and remain marked for confirmation.`,
    'The report is organised into the training organisation, the training experience, and the conclusion. It is generated from the trainee-approved diary entries, cached Git evidence, and the screenshots stored in the local workspace.',
  ]);
  const tocPage = addPage(pdf, fonts);
  const figurePage = addPage(pdf, fonts);
  const abbreviationsPage = addPage(pdf, fonts);
  const pages = new Map();
  const writer = new ReportWriter(pdf, fonts);

  writer.heading('Chapter 1: Training organization', 1);
  pages.set('1.0 Introduction', writer.pageNumber());
  writer.paragraph(
    'Only a limited amount of organization information is present in the diary profile. The training establishment confirmed by the available data is Creative Software. Organization facts, services, location, and team details must be added from approved company sources before submission.',
  );
  addSection(writer, pages, '1.1 About the training organization', [
    'The trainee completed industrial training at Creative Software during the period recorded in the profile. The available weekly diary shows work across full-stack application development, metadata-driven product features, interface design, document workflows, AI-related foundations, recruitment workflows, and dashboard visualisations.',
    'This section is intentionally limited to information supported by the local diary. It does not infer the company history, employee count, hierarchy, business address, or public services.',
  ]);
  addSection(
    writer,
    pages,
    '1.2 Working context represented by the diary',
    [
      'The diary shows work that crossed frontend, backend, database, permissions, testing, documentation, deployment, privacy, and user-interface concerns. The work was recorded across several cached repositories, so the final report should add the approved team and project names where the trainee confirms them.',
    ],
    [
      'Use the approved company description and official logo in the final version.',
      'Keep customer, employee, credential, and internal product information out of the report.',
    ],
  );

  writer.heading('Chapter 2: Training experience', 1);
  pages.set('2.0 Training experience', writer.pageNumber());
  writer.paragraph(
    'The following account groups the 30 diary weeks into work streams. It keeps the diary wording as the evidence base and summarises the progression without turning every commit into a separate claim.',
  );
  const groups = [
    ['2.1 Foundation and familiarisation', group(diary.weeks, 0, 5)],
    ['2.2 Product feature development', group(diary.weeks, 5, 10)],
    ['2.3 Documentation, media, and UI quality', group(diary.weeks, 10, 15)],
    ['2.4 AI, privacy, tooling, and migration', group(diary.weeks, 15, 20)],
    ['2.5 Leave period', group(diary.weeks, 20, 22)],
    ['2.6 Navigation, recruitment, and dashboards', group(diary.weeks, 22, 30)],
  ];
  for (const [title, items] of groups) {
    addSection(writer, pages, title, [rangeText(items)], workTexts(items));
    const learning = pointTexts(items, 'learning');
    if (learning.length) writer.paragraph(`Learning recorded for this period: ${learning.slice(0, 2).join(' ')}`);
  }
  addSection(
    writer,
    pages,
    '2.7 Problems encountered and solutions',
    [
      'The diary records problems involving integration, responsive behaviour, state restoration, search and filtering, document export parity, permissions, privacy, deployment, attachments, and recruitment workflows. The solutions recorded in the diary include separating service responsibilities, aligning frontend and backend contracts, protecting state and permissions, adding validation, improving test and pipeline support, and checking the resulting user flows.',
    ],
    [...pointTexts(diary.weeks, 'problems').slice(0, 12), ...pointTexts(diary.weeks, 'solutions').slice(0, 12)],
  );
  addSection(writer, pages, '2.8 Evidence and screenshots', [
    'The following figures are selected from the screenshots already stored in the diary workspace. They illustrate representative interface work. Each screenshot remains subject to a final confidentiality and redaction review before submission.',
  ]);
  const figureEntries = [];
  for (const [index, screenshot] of screenshots.entries()) {
    const page = await writer.figure(screenshot, index + 1, `${screenshot.caption} (week ${screenshot.week})`);
    figureEntries.push({ label: `Figure ${index + 1}: ${screenshot.caption}`, page });
  }

  writer.heading('Chapter 3: Conclusion', 1);
  pages.set('3.0 Conclusion', writer.pageNumber());
  writer.paragraph(
    'The diary shows a progression from setting up a full-stack foundation to contributing across product features, user interfaces, document workflows, AI-related foundations, recruitment workflows, and dashboard visualisations. It also records the need to communicate clearly, document work, understand ownership, and review changes from the user perspective.',
  );
  addSection(
    writer,
    pages,
    '3.1 Skills and knowledge gained',
    [
      'The recorded learning points show growth in understanding application architecture, frontend and backend integration, metadata-driven systems, permissions, validation, privacy, document exports, developer tooling, and product-facing UI behaviour.',
    ],
    pointTexts(diary.weeks, 'learning').slice(0, 10),
  );
  addSection(
    writer,
    pages,
    '3.2 SWOT analysis',
    [
      'This draft SWOT analysis is derived from the skills, problems, and improvements recorded in the diary. The trainee should review the wording before submission.',
    ],
    [
      'Strengths: working across application layers, tracing changes through a feature, documenting work, learning from feedback, and contributing to user-facing improvements.',
      'Weaknesses to improve: keeping daily notes complete, communicating uncertainty early, and making time for consistent review and testing evidence.',
      'Opportunities: deeper backend, DevOps, AI, observability, testing, and product-engineering practice.',
      'Threats or risks: changing requirements, cross-layer regressions, permission mistakes, privacy exposure, and incomplete handover information.',
    ],
  );
  addSection(
    writer,
    pages,
    '3.3 Improvement plan',
    [
      'The diary repeatedly points toward earlier edge-case checks, clearer ownership, better documentation, end-to-end walkthroughs, and stronger review habits. These are practical improvements that can carry forward into future backend, DevOps, AI, and product-engineering work.',
    ],
    pointTexts(diary.weeks, 'improvements').slice(0, 10),
  );

  writer.heading('References', 1, pages);
  writer.paragraph(
    'The final reference list must be expanded with the approved university and company sources used for Chapter 1 and the selected images. The following local records are the sources used for this draft:',
  );
  for (const ref of [
    'NAITA internship diary, local/profile.json and local/weeks/*.json, accessed 17 September 2026.',
    'Cached Git evidence, local/state.json, imported from the training repositories, accessed 17 September 2026.',
    'Trainee-supplied screenshots in local/screenshots/, accessed 17 September 2026.',
    'University of Sri Jayewardenepura logo supplied at local/report/usjp.jpg, accessed 17 September 2026.',
  ])
    writer.bullet(ref);

  writer.heading('Supervisor certification', 1, pages);
  writer.paragraph(
    'To be completed by the supervisor or authorized officer. The name, designation, date, stamp, and signature must not be invented or filled by the writing agent.',
  );
  writer.paragraph(
    "I hereby certify that I have checked this report and that it records the trainee's industrial training activities for the stated period.",
  );
  for (const line of [
    'Name: __________________________________________',
    'Designation: _____________________________________',
    'Date: ____________________________________________',
    '',
    'Signature and official stamp: _______________________',
  ])
    writer.line(line);

  const tocEntries = [
    { label: '1.0 Introduction', page: pages.get('1.0 Introduction') },
    { label: '1.1 About the training organization', page: pages.get('1.1 About the training organization') },
    {
      label: '1.2 Working context represented by the diary',
      page: pages.get('1.2 Working context represented by the diary'),
    },
    { label: '2.0 Training experience', page: pages.get('2.0 Training experience') },
    ...groups.map(([title]) => ({ label: title, page: pages.get(title) })),
    { label: '2.7 Problems encountered and solutions', page: pages.get('2.7 Problems encountered and solutions') },
    { label: '2.8 Evidence and screenshots', page: pages.get('2.8 Evidence and screenshots') },
    { label: '3.0 Conclusion', page: pages.get('3.0 Conclusion') },
    { label: '3.1 Skills and knowledge gained', page: pages.get('3.1 Skills and knowledge gained') },
    { label: '3.2 SWOT analysis', page: pages.get('3.2 SWOT analysis') },
    { label: '3.3 Improvement plan', page: pages.get('3.3 Improvement plan') },
    { label: 'References', page: pages.get('References') },
    { label: 'Supervisor certification', page: pages.get('Supervisor certification') },
  ];
  drawListPage(tocPage, 'TABLE OF CONTENTS', tocEntries, fonts);
  drawListPage(figurePage, 'LIST OF FIGURES', figureEntries, fonts);
  drawListPage(
    abbreviationsPage,
    'ABBREVIATIONS',
    [
      { label: 'AI - Artificial Intelligence', page: '' },
      { label: 'API - Application Programming Interface', page: '' },
      { label: 'ATS - Applicant Tracking System', page: '' },
      { label: 'EMS - Employee Management System', page: '' },
      { label: 'KPI - Key Performance Indicator', page: '' },
      { label: 'UI - User Interface', page: '' },
      { label: 'SDK - Software Development Kit', page: '' },
      { label: 'SQL - Structured Query Language', page: '' },
    ],
    fonts,
  );

  pdf.setTitle(`NAITA Industrial Training Report - ${config.name || 'Student'}`);
  pdf.setAuthor(config.name || 'Student');
  pdf.setSubject('Industrial training report generated from the NAITA diary workspace');
  const bytes = await pdf.save();
  writeAtomic(target, bytes);
  return {
    path: target,
    pages: pdf.getPageCount(),
    font: fonts.paths.regular,
    logo: existsSync(logoPath) ? logoPath : null,
    figures: figureEntries.length,
    sourcePath,
    warnings: [...(existsSync(logoPath) ? [] : [`University logo not found at ${logoPath}.`]), ...screenshotWarnings],
  };
}
