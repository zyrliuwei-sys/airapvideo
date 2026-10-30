/**
 * Themed generator pages and their styles (client-safe). A theme replaces
 * the orange rap booth with its own scene; each style has a sample clip in
 * public/videos/<folder>/ and matching prompts in
 * routes/api/hotel-lobby/-<theme>.ts. `needsTwo` styles require both
 * photos; the others take one (solo) or two (lead + partner).
 */
export const SCENE_THEMES = {
  tinydesk: {
    folder: 'tiny-desk',
    styles: {
      band: { sample: 'mini-desk', needsTwo: false },
      session: { sample: 'outstanding-solo', needsTwo: false },
      closeup: { sample: 'band-and-sax', needsTwo: false },
      duet: { sample: 'desk-concert', needsTwo: true },
    },
  },
  thriller: {
    folder: 'thriller',
    styles: {
      street: { sample: 'zombie-street', needsTwo: false },
      reveal: { sample: 'close-up-reveal', needsTwo: false },
      jacket: { sample: 'red-jacket', needsTwo: false },
      yard: { sample: 'pumpkin-yard', needsTwo: false },
    },
  },
} as const;

export type SceneTheme = keyof typeof SCENE_THEMES;
export type ThemeStyle<T extends SceneTheme> =
  keyof (typeof SCENE_THEMES)[T]['styles'];

export function isSceneTheme(value: unknown): value is SceneTheme {
  return typeof value === 'string' && Object.hasOwn(SCENE_THEMES, value);
}

/** The requested style of a theme, or its first style when unknown. */
export function themeStyle(theme: SceneTheme, value: unknown): string {
  const styles = SCENE_THEMES[theme].styles;
  return typeof value === 'string' && Object.hasOwn(styles, value)
    ? value
    : Object.keys(styles)[0];
}

export function styleNeedsTwo(theme: SceneTheme, style: string): boolean {
  const styles: Record<string, { needsTwo: boolean }> =
    SCENE_THEMES[theme].styles;
  return styles[style]?.needsTwo ?? false;
}

/** Sample clip (video + poster) of a theme's style. */
export function styleSample(theme: SceneTheme, style: string) {
  const { folder, styles } = SCENE_THEMES[theme];
  const sample = (styles as Record<string, { sample: string }>)[style].sample;
  return {
    src: `/videos/${folder}/${sample}.mp4`,
    poster: `/videos/${folder}/${sample}.jpg`,
  };
}
