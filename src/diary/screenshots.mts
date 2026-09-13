import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { embedImage } from '../pdf/images.mts';

export async function scanScreenshots(week) {
  const result = {
    folder: week.screenshotFolder,
    images: [],
    errors: [],
    ignored: [],
    notRequiredReason: week.entry.screenshots.notRequiredReason,
  };
  if (!existsSync(week.screenshotFolder)) return result;
  if (lstatSync(week.screenshotFolder).isSymbolicLink())
    throw new Error('Screenshot folders must be real folders, not symbolic links.');
  const scratch = await PDFDocument.create();
  for (const name of readdirSync(week.screenshotFolder).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (name.startsWith('.')) continue;
    const path = join(week.screenshotFolder, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      result.errors.push(`${name}: symbolic links are not supported.`);
      continue;
    }
    if (!stat.isFile()) {
      result.ignored.push(name);
      continue;
    }
    const extension = extname(name).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(extension)) {
      result.ignored.push(name);
      continue;
    }
    try {
      if (stat.size > 25 * 1024 * 1024) throw new Error('image exceeds 25 MB');
      const bytes = readFileSync(path);
      const embedded = await embedImage(scratch, bytes, extension === '.png' ? 'png' : 'jpg');
      if (!embedded.width || !embedded.height) throw new Error('image has no dimensions');
      result.images.push({
        name,
        path,
        kind: extension === '.png' ? 'png' : 'jpg',
        width: embedded.width,
        height: embedded.height,
        hash: createHash('sha256').update(bytes).digest('hex'),
        caption: week.entry.screenshots.captions[name]?.trim() || name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      });
    } catch (error) {
      result.errors.push(`${name}: ${error.message || String(error)}`);
    }
  }
  return result;
}
