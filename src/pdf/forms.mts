import { displayDate } from '../diary/dates.mts';
import { rgb } from 'pdf-lib';
import { dailyPoints } from '../diary/entries.mts';
import { drawText, drawSingleLine, bulletLines } from './layout.mts';

export function drawInfo(page, config, font) {
  const entries = [
    ['name', 94, 710.02, 425],
    ['privateAddress', 207, 689.38, 310],
    ['phone', 178, 668.62, 337],
    ['category', 110, 647.98, 405],
    ['field', 178, 627.22, 337],
    ['instituteRegistration', 365, 606.58, 150],
    ['naitaRegistration', 269, 585.79, 246],
    ['establishment', 242, 565.15, 273],
  ];
  for (const [key, x, y, width] of entries) drawSingleLine(page, config[key], x, y, width, font, 10, true);
  drawSingleLine(page, displayDate(config.trainingStart), 258, 544.51, 80, font, 9, true);
  drawSingleLine(page, displayDate(config.trainingEnd), 375, 544.51, 140, font, 9, true);
}
export function drawWeek(page, week, config, font) {
  for (const [x, y, width, height] of [
    [298, 770, 84, 17],
    [131, 717, 103, 15],
    [334, 717, 222, 15],
  ]) {
    page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
  }
  drawText(page, String(week.number), 323, 773.16, 11, font);
  drawText(page, displayDate(week.sunday), 134, 719.98, 9, font);
  drawSingleLine(page, config.trainingLocation || config.establishment, 340, 719.98, 212, font, 9);
  const overflow = [];
  for (let index = 0; index < week.days.length; index += 1) {
    const day = week.days[index];
    if (!day.inPeriod) continue;
    const y = 649 - index * 76.55;
    drawText(page, displayDate(day.date), 120, y, 7.2, font);
    const points = dailyPoints(day, week.entry);
    let lines = bulletLines(points.length ? points : [{ text: 'No work recorded yet.' }], font, 9, 395);
    if (lines.length > 5) {
      overflow.push({ date: day.date, points });
      lines = bulletLines([{ text: "See daily work details in this week's notes." }], font, 9, 395);
    }
    lines.forEach((line, lineIndex) => {
      if (line.first) drawText(page, '•', 170, y - lineIndex * 12, 9, font);
      drawText(page, line.text, 182, y - lineIndex * 12, 9, font);
    });
  }
  return overflow;
}
