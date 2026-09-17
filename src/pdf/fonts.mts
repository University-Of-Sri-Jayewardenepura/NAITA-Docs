import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
function siblingFont(regular, names) {
  const directory = dirname(regular);
  return names.map((name) => join(directory, name)).find((path) => existsSync(path));
}
export function findTimesFamily(explicit) {
  const regular = findTimesFont(explicit);
  const family = {
    regular,
    bold: siblingFont(regular, ['Times New Roman Bold.ttf', 'timesbd.ttf']),
    italic: siblingFont(regular, ['Times New Roman Italic.ttf', 'timesi.ttf']),
    boldItalic: siblingFont(regular, ['Times New Roman Bold Italic.ttf', 'timesbi.ttf']),
  };
  const missing = Object.entries(family)
    .filter(([, path]) => !path)
    .map(([name]) => name);
  if (missing.length)
    throw new Error(
      `Times New Roman variants are missing: ${missing.join(', ')}. Install the full font family or pass --font.`,
    );
  return family;
}
async function embedFont(pdf, path) {
  const bytes = readFileSync(path);
  const metadata = fontkit.create(bytes);
  if (!/TimesNewRoman|Times New Roman/i.test(`${metadata.familyName} ${metadata.postscriptName}`))
    throw new Error(`Font is not Times New Roman: ${path}`);
  return pdf.embedFont(bytes, { subset: true });
}
export async function embedTimesFamily(pdf, explicit) {
  const paths = findTimesFamily(explicit);
  pdf.registerFontkit(fontkit);
  return {
    regular: await embedFont(pdf, paths.regular),
    bold: await embedFont(pdf, paths.bold),
    italic: await embedFont(pdf, paths.italic),
    boldItalic: await embedFont(pdf, paths.boldItalic),
    paths,
  };
}
export async function embedTimes(pdf, explicit) {
  const family = await embedTimesFamily(pdf, explicit);
  return { font: family.regular, path: family.paths.regular };
}
