import { rgb } from 'pdf-lib';

export function printable(value) {
  return (
    String(value ?? '')
      .replace(/[\u2010-\u2015]/g, '-')
      // oxlint-disable-next-line no-control-regex -- keep control bytes out of PDF text streams
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
export function wrap(value, font, size, width) {
  const words = printable(value).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && font.widthOfTextAtSize(`${line} ${word}`, size) <= width) {
      line += ` ${word}`;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function drawText(page, value, x, y, size, font) {
  const text = printable(value);
  const characters = new Set(font.getCharacterSet());
  const missing = [...text].find((character) => !characters.has(character.codePointAt(0)));
  if (missing)
    throw new Error(
      `Times New Roman cannot print ${JSON.stringify(missing)}. Edit the diary point or caption containing it.`,
    );
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}
export function drawSingleLine(page, value, x, y, width, font, preferred = 10, clearDots = false) {
  if (!value) return;
  let size = preferred;
  while (size > 7 && font.widthOfTextAtSize(printable(value), size) > width) size -= 0.25;
  if (font.widthOfTextAtSize(printable(value), size) > width)
    throw new Error(`Text does not fit the profile/location field: ${value}. Please shorten it.`);
  if (clearDots)
    page.drawRectangle({
      x: x - 1,
      // The source dotted guide is four points below the raised value.
      y: y - 7,
      width: font.widthOfTextAtSize(printable(value), size) + 3,
      height: size + 10,
      color: rgb(1, 1, 1),
    });
  drawText(page, value, x, y, size, font);
}
export function addTemplatePage(pdf, template) {
  const page = pdf.addPage([template.width, template.height]);
  page.drawPage(template, { x: 0, y: 0, width: template.width, height: template.height });
  return page;
}
export function bulletLines(points, font, size, width) {
  return points.flatMap((point) =>
    wrap(point.text, font, size, width - 12).map((text, index) => ({ text, first: index === 0 })),
  );
}
