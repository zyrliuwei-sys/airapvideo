export type CropPosition = { x: number; y: number };
export type CropSettings = CropPosition & {
  zoom: number;
  shape: 'original' | 'portrait' | 'square';
};

export const initialCrop: CropSettings = {
  x: 0,
  y: 0,
  zoom: 1,
  shape: 'original',
};
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Source-image coordinates shared by the local preview and exported photo. */
export function cropRect(
  width: number,
  height: number,
  settings: CropSettings
) {
  const aspect =
    settings.shape === 'portrait'
      ? 4 / 5
      : settings.shape === 'square'
        ? 1
        : width / height;
  const cropWidth =
    Math.min(width, height * aspect) / clamp(settings.zoom, 1, 3);
  const cropHeight = cropWidth / aspect;
  return {
    x: ((width - cropWidth) * (clamp(settings.x, -1, 1) + 1)) / 2,
    y: ((height - cropHeight) * (clamp(settings.y, -1, 1) + 1)) / 2,
    width: cropWidth,
    height: cropHeight,
    aspect,
  };
}
