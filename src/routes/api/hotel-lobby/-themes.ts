/**
 * Themed scenes (see config/scene-themes.ts): picks the prompt builders of
 * the requested theme. Absent look = the classic orange-booth rap duet.
 */

import type { DuetLength } from '@/config/hotel-lobby-pricing';
import type { SceneTheme } from '@/config/scene-themes';

import {
  buildThrillerPerformancePrompt,
  buildThrillerScenePrompt,
  type ThrillerLook,
} from './-thriller';
import {
  buildDeskPerformancePrompt,
  buildDeskScenePrompt,
  type DeskLook,
} from './-tiny-desk';

/** Theme, style and photo count of a job; saved with paid purchases. */
export type ThemeLook = {
  theme: SceneTheme;
  variant: string;
  solo: boolean;
};

export function buildThemeScenePrompt(look: ThemeLook) {
  return look.theme === 'thriller'
    ? buildThrillerScenePrompt(look as ThrillerLook)
    : buildDeskScenePrompt(look as DeskLook);
}

export function buildThemePerformancePrompt(
  length: DuetLength,
  look: ThemeLook
) {
  return look.theme === 'thriller'
    ? buildThrillerPerformancePrompt(length, look as ThrillerLook)
    : buildDeskPerformancePrompt(length, look as DeskLook);
}
