/**
 * Tiny Desk generator styles (client-safe). Each style has a sample clip in
 * public/videos/tiny-desk/ and matching prompts in
 * routes/api/hotel-lobby/-tiny-desk.ts. `needsTwo` styles require both photos;
 * the others take one (solo) or two (lead + backing singer).
 */
export const DESK_STYLES = {
  band: { sample: 'mini-desk', needsTwo: false },
  session: { sample: 'outstanding-solo', needsTwo: false },
  closeup: { sample: 'band-and-sax', needsTwo: false },
  duet: { sample: 'desk-concert', needsTwo: true },
} as const;

export type DeskStyle = keyof typeof DESK_STYLES;

export const DEFAULT_DESK_STYLE: DeskStyle = 'band';

export function isDeskStyle(value: unknown): value is DeskStyle {
  return typeof value === 'string' && value in DESK_STYLES;
}
