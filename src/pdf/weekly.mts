import { readFileSync } from 'node:fs';
import { SECTIONS } from '../diary/entries.mts';
import { displayDate } from '../diary/dates.mts';
import { addTemplatePage, drawText, wrap } from './layout.mts';
import { embedImage } from './images.mts';

// Source page 4: x=74..536, y=155..755. Source page 5 has a much
// shorter notes area: stop above y=335 to protect signatures/certification.
export async function drawWeeklyNotes(pdf, templates, week, font, screenshots, overflow) {
  let page;
  let y;
  let bottom;
  function newPage(final = false) {
    page = addTemplatePage(pdf, templates[final ? 4 : 3]);
    bottom = final ? 335 : 155;
    y = final ? 735 : 748;
    drawText(page, `Week ${week.number} | ${displayDate(week.monday)} - ${displayDate(week.sunday)}`, 84, y, 10, font);
    y -= 24;
  }
  function heading(text) {
    if (y - 42 < bottom) newPage();
    drawText(page, text, 84, y, 11.5, font);
    y -= 19;
  }
  function bullet(text, continuationHeading) {
    const lines = wrap(text, font, 10.5, 428);
    for (let i = 0; i < lines.length; i += 1) {
      if (y < bottom) {
        newPage();
        heading(`${continuationHeading} (continued)`);
      }
      if (i === 0) drawText(page, '•', 84, y, 10.5, font);
      drawText(page, lines[i], 96, y, 10.5, font);
      y -= 14;
    }
    y -= 5;
  }
  newPage();
  for (const [section, title] of Object.entries(SECTIONS)) {
    heading(title);
    const points = week.entry.sections[section];
    for (const point of points.length ? points : [{ text: 'Not filled in yet.' }]) bullet(point.text, title);
    y -= 7;
  }
  for (const detail of overflow) {
    const title = `Daily work details - ${displayDate(detail.date)}`;
    heading(title);
    for (const point of detail.points) bullet(point.text, title);
  }
  // Screenshots follow all weekly text. The last image uses the shorter
  // continuation sheet, which preserves the engineer's certification below.
  for (let index = 0; index < screenshots.images.length; index += 1) {
    const image = screenshots.images[index];
    const last = index === screenshots.images.length - 1;
    const captionLines = wrap(`${index + 1}. ${image.caption}`, font, 10, 440);
    if (captionLines.length > 6)
      throw new Error(`Screenshot caption is too long: ${image.name}. Keep it to six lines.`);
    const maxHeight = last ? 275 : 330;
    const scale = Math.min(440 / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const required = 27 + height + captionLines.length * 13 + 15;
    if (last) newPage(true);
    else if (y - required < bottom) newPage();
    heading('Screenshots of the work');
    const bytes = readFileSync(image.path);
    const embedded = await embedImage(pdf, bytes, image.kind);
    page.drawImage(embedded, { x: 84 + (440 - width) / 2, y: y - height, width, height });
    y -= height + 17;
    for (const line of captionLines) {
      drawText(page, line, 84, y, 10, font);
      y -= 13;
    }
    y -= 15;
  }
  if (!screenshots.images.length) {
    newPage(true);
    heading('Screenshots of the work');
    bullet(
      screenshots.notRequiredReason
        ? `No screenshots: ${screenshots.notRequiredReason}`
        : 'Screenshots have not been added yet.',
      'Screenshots of the work',
    );
  }
}
