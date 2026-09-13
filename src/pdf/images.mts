export function embedImage(pdf, bytes, kind) {
  // pdf-lib's JPEG decoder reads from byte zero of the backing ArrayBuffer.
  // Node file buffers may be slices of a shared pool, so give the decoder an
  // owned, zero-offset array. This also keeps scan and export behaviour equal.
  const data = new Uint8Array(bytes);
  return kind === 'png' ? pdf.embedPng(data) : pdf.embedJpg(data);
}
