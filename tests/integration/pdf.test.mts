import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { fixture, seedRepo, screenshot, PROFILE } from '../helpers/fixtures.mts';
import { pdfPages } from '../helpers/pdf.mts';
import { execute } from '../../src/cli/main.mts';
import { loadDiary, saveWeek } from '../../src/diary/store.mts';
import { point, SECTIONS } from '../../src/diary/entries.mts';
import { renderDiary, TEMPLATE_PATH } from '../../src/pdf/render.mts';

let context;
afterEach(() => context?.cleanup());

it('fills the supplied PDF with weekly bullets and images, while preserving template and official pages', async () => {
  context = fixture();
  seedRepo(context.repo);
  const digest = () => createHash('sha256').update(readFileSync(TEMPLATE_PATH)).digest('hex');
  const before = digest();
  const options = { workspace: context.workspace };
  await execute('import', { ...options, repo: context.repo, leave: '2026-04-10', medical: '2026-04-17' });
  const diary = loadDiary(context.workspace);
  for (const week of diary.weeks) {
    for (const section of Object.keys(SECTIONS))
      week.entry.sections[section].push(point(`Week ${week.number} ${section} example.`));
    screenshot(week.screenshotFolder);
    week.entry.screenshots.captions['01-task-list.png'] = `Week ${week.number} task list after the change`;
    saveWeek(context.workspace, week);
  }
  const out = join(context.root, 'filled.pdf');
  const result = await execute('generate', { ...options, out });
  expect(result.pages).toBe(11);
  const pages = await pdfPages(out);
  expect(pages[1].text).toContain(PROFILE.name);
  expect(pages[2].text).toContain('Authorized leave.');
  expect(pages[2].text).toContain('Added a search box');
  expect(pages[3].text).toContain('How they were solved');
  expect(pages[3].text).toContain('Week 1 learning example.');
  expect(pages[3].text).not.toContain('Week 2 learning example.');
  expect(pages[4].text).toContain('Week 1 task list after the change');
  expect(pages[4].text).toContain('REMARKS AND CERTIFICATION');
  expect(pages[5].text).toContain('Medical leave.');
  expect(pages[6].text).toContain('Week 2 work example.');
  expect(pages[7].text).toContain('Week 2 task list after the change');
  expect(pages[3].items.filter((item) => item.str === '•').length).toBeGreaterThanOrEqual(5);
  for (const item of pages[3].items.filter((item) =>
    /Week 1 (work|problems|solutions|learning|improvements) example/.test(item.str),
  )) {
    expect(item.transform[4]).toBeGreaterThanOrEqual(84);
    expect(item.transform[4] + item.width).toBeLessThanOrEqual(526);
    expect(item.transform[5]).toBeGreaterThanOrEqual(155);
  }
  const original = await pdfPages(TEMPLATE_PATH);
  for (let i = 0; i < 3; i += 1) expect(pages[8 + i].text).toBe(original[5 + i].text);
  expect(pages[0].text).toBe(original[0].text);
  const pdf = await PDFDocument.load(readFileSync(out));
  for (const index of [4, 7]) {
    const xobjects = pdf.getPage(index).node.Resources().lookup(PDFName.of('XObject'));
    const images = xobjects
      .values()
      .map((ref) => pdf.context.lookup(ref))
      .filter((object) => object.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image');
    expect(images.length).toBeGreaterThan(0);
  }
  expect(digest()).toBe(before);
});

it('paginates long notes and daily overflow without dropping the last point or covering signatures', async () => {
  context = fixture({ ...PROFILE, trainingEnd: '2026-04-06' });
  await execute('absence', { workspace: context.workspace, leave: '', medical: '' });
  const diary = loadDiary(context.workspace);
  const week = diary.weeks[0];
  for (let i = 0; i < 45; i += 1)
    week.entry.sections.work.push(
      point(
        `Point ${i + 1}: Checked how the task list behaves when searching by title and clearing the search field. This helped identify a confusing empty state.`,
      ),
    );
  week.entry.sections.improvements.push(point('LAST WEEKLY POINT: Check empty results earlier next week.'));
  week.entry.days['2026-04-06'].push(
    point(
      'DAILY OVERFLOW: ' +
        'Reviewed the search behaviour and recorded the result. '.repeat(30) +
        'END OF DAILY DETAILS.',
    ),
  );
  const out = join(context.root, 'long.pdf');
  const result = await renderDiary(diary, out);
  expect(result.pages).toBeGreaterThan(8);
  const pages = await pdfPages(out);
  expect(pages[2].text).toContain('See daily work details');
  const all = pages.map((page) => page.text).join(' ');
  expect(all).toContain('LAST WEEKLY POINT');
  expect(all).toContain('END OF DAILY DETAILS.');
  expect(all).toContain('Point 45:');
  for (const page of pages.slice(3, -4)) {
    for (const item of page.items.filter((item) =>
      /Point \d+:|search behaviour|END OF DAILY|LAST WEEKLY/.test(item.str),
    )) {
      expect(item.transform[5]).toBeGreaterThanOrEqual(155);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(526);
    }
  }
});

it('refuses source overwrites, corrupt images, missing fonts, and incomplete strict exports', async () => {
  context = fixture();
  const options = { workspace: context.workspace };
  await execute('absence', { ...options, leave: '', medical: '' });
  const diary = loadDiary(context.workspace);
  const out = join(context.root, 'invalid.pdf');
  await expect(renderDiary(diary, TEMPLATE_PATH)).rejects.toThrow(/source PDF/);
  await expect(renderDiary(diary, out, { font: '/nonexistent/times.ttf' })).rejects.toThrow(/Font not found/);
  writeFileSync(join(diary.weeks[0].screenshotFolder, 'broken.png'), 'not an image');
  await expect(renderDiary(diary, out)).rejects.toThrow(/invalid screenshots/);
  await expect(execute('generate', { ...options, out, strict: true })).rejects.toThrow(/not ready/);
  expect(existsSync(out)).toBe(false);
});
