import { readFileSync, mkdirSync, writeFileSync, realpathSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { embedTimes } from './fonts.mts';
import { addTemplatePage } from './layout.mts';
import { drawInfo, drawWeek } from './forms.mts';
import { drawWeeklyNotes } from './weekly.mts';
import { scanScreenshots } from '../diary/screenshots.mts';

export const TEMPLATE_PATH = fileURLToPath(new URL('../../docs/Daily Diary.pdf', import.meta.url));
export async function renderDiary(diary, outputPath, options = {}) {
  const templatePath = resolve(options.template || TEMPLATE_PATH);
  const target = resolve(outputPath);
  if (target === templatePath || (existsSync(target) && realpathSync(target) === realpathSync(templatePath)))
    throw new Error('Output must not overwrite the source PDF template.');
  if (!target.toLowerCase().endsWith('.pdf')) throw new Error('Output filename must end with .pdf.');
  const source = await PDFDocument.load(readFileSync(templatePath));
  if (
    source.getPageCount() !== 8 ||
    source.getPages().some((page) => Math.abs(page.getWidth() - 595.32) > 1 || Math.abs(page.getHeight() - 841.92) > 1)
  )
    throw new Error('Expected the supplied eight-page A4 NAITA template.');
  const pdf = await PDFDocument.create();
  const { font, path: fontPath } = await embedTimes(pdf, options.font);
  pdf.setTitle(`NAITA Internship Diary - ${diary.config.name}`);
  pdf.setAuthor(diary.config.name);
  const templates = await pdf.embedPdf(source, source.getPageIndices());
  addTemplatePage(pdf, templates[0]);
  drawInfo(addTemplatePage(pdf, templates[1]), diary.config, font);
  for (const week of diary.weeks) {
    const screenshots = await scanScreenshots(week);
    if (screenshots.errors.length)
      throw new Error(`Week ${week.number} has invalid screenshots: ${screenshots.errors.join('; ')}`);
    const overflow = drawWeek(addTemplatePage(pdf, templates[2]), week, diary.config, font);
    await drawWeeklyNotes(pdf, templates, week, font, screenshots, overflow);
  }
  for (let index = 5; index < templates.length; index += 1) addTemplatePage(pdf, templates[index]);
  const bytes = await pdf.save();
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temp, bytes);
  renameSync(temp, target);
  return { path: target, pages: pdf.getPageCount(), font: fontPath };
}
