/** Downscale an image file to a JPEG data URL (browser only). */
export async function photoToDataUrl(
  file: File,
  maxSide = 1280,
  quality = 0.85
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/** Turn a base64 data URL back into a File for the regular upload flow. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, base64] = dataUrl.split(',');
  const type = /^data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}
