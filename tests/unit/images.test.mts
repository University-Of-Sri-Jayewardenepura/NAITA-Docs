import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { embedImage } from '../../src/pdf/images.mts';
import { JPEG } from '../helpers/fixtures.mts';

it('embeds a JPEG held at a non-zero offset in a shared buffer', async () => {
  const allocation = Buffer.alloc(JPEG.length + 32, 7);
  JPEG.copy(allocation, 16);
  const slice = allocation.subarray(16, 16 + JPEG.length);
  const image = await embedImage(await PDFDocument.create(), slice, 'jpg');
  expect(image.width).toBe(2);
  expect(image.height).toBe(2);
});
