/** Turn a picked image file into a small square-ish `data:` URI for a logo. */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

/**
 * Read an image, downscale so its longest edge is `max` px, and return a
 * `data:` URI kept under `budget` characters (PNG, falling back to JPEG).
 */
export async function fileToLogoDataUrl(
  file: File,
  { max = 128, budget = 260_000 }: { max?: number; budget?: number } = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file.');
  }

  const img = await loadImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('That image looks empty.');

  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let uri = canvas.toDataURL('image/png');
  for (const quality of [0.85, 0.6]) {
    if (uri.length <= budget) break;
    uri = canvas.toDataURL('image/jpeg', quality);
  }
  if (uri.length > budget) throw new Error('That image is too large.');
  return uri;
}
