import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import fontkit from '@pdf-lib/fontkit';

export function findTimesFont(explicit) {
  const requested = explicit || process.env.NAITA_TIMES_FONT;
  if (requested) {
    if (!existsSync(resolve(requested))) throw new Error(`Font not found: ${requested}`);
    return resolve(requested);
  }
  const candidates = [
    'C:\\Windows\\Fonts\\times.ttf',
    '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
    '/Library/Fonts/Times New Roman.ttf',
    join(homedir(), 'Library/Fonts/Times New Roman.ttf'),
    '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf',
    '/usr/share/fonts/truetype/msttcorefonts/times.ttf',
    join(homedir(), '.local/share/fonts/times.ttf'),
  ];
  const path = candidates.find((path) => existsSync(path));
  if (!path)
    throw new Error(
      'Times New Roman was not found. Install it or pass --font /path/to/times.ttf (or NAITA_TIMES_FONT).',
    );
  return path;
}
export async function embedTimes(pdf, explicit) {
  const path = findTimesFont(explicit);
  const bytes = readFileSync(path);
  const metadata = fontkit.create(bytes);
  if (!/TimesNewRoman|Times New Roman/i.test(`${metadata.familyName} ${metadata.postscriptName}`))
    throw new Error('--font must point to a Times New Roman font.');
  pdf.registerFontkit(fontkit);
  return { font: await pdf.embedFont(bytes, { subset: true }), path };
}
