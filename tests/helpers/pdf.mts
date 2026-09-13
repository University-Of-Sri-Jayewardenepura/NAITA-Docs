import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function pdfPages(path) {
  const task = getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push({
        number,
        items: content.items.filter((item) => 'str' in item),
        text: content.items.map((item) => item.str || '').join(' '),
        styles: content.styles,
      });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
