/**
 * Prompts for the Thriller dance generator: the photo's person leads a
 * zombie dance crowd at night instead of rapping in the orange booth. One
 * photo makes a solo lead dancer; two put a second dancer beside them.
 */

import { DUET_LENGTHS, type DuetLength } from '@/config/hotel-lobby-pricing';
import type { ThemeStyle } from '@/config/scene-themes';

export type ThrillerLook = { variant: ThemeStyle<'thriller'>; solo: boolean };

const SCENES: Record<ThemeStyle<'thriller'>, { solo: string; duo: string }> = {
  street: {
    solo: `Place Subject A full body, head to toe, standing front and center on a foggy, moonlit city street at night as the lead dancer, mid-pose with arms raised in a stiff, claw-handed zombie pose. Behind them, a crowd of AI zombie dancers in torn, dusty clothes stands in a loose V formation, clearly background and smaller in frame.`,
    duo: `Place Subject A on the left and Subject B on the right, both full body, head to toe, standing side by side front and center on a foggy, moonlit city street at night as the two lead dancers, mid-pose with arms raised in a stiff, claw-handed zombie pose. Behind them, a crowd of AI zombie dancers in torn, dusty clothes stands in a loose V formation, clearly background and smaller in frame.`,
  },
  reveal: {
    solo: `Frame an extreme close-up portrait of Subject A: their face fills most of the frame, calm and still, looking straight into the camera, lit by cold blue moonlight. A foggy night street with a few blurred figures is barely visible behind them.`,
    duo: `Frame a tight close-up of Subject A (left) and Subject B (right) side by side, their faces filling most of the frame, calm and still, looking straight into the camera, lit by cold blue moonlight. A foggy night street with a few blurred figures is barely visible behind them.`,
  },
  jacket: {
    solo: `Place Subject A full body, head to toe, as the lead dancer front and center on a wet, foggy city street at night, restyled in a glossy red leather jacket with black V-shaped stripes and matching red trousers. Behind them, a crowd of AI dancers in dark suits and dresses stands in formation under the streetlights, clearly background.`,
    duo: `Place Subject A on the left and Subject B on the right, full body, head to toe, as the two lead dancers front and center on a wet, foggy city street at night, both restyled in glossy red leather jackets with black V-shaped stripes and red trousers. Behind them, a crowd of AI dancers in dark suits and dresses stands in formation, clearly background.`,
  },
  yard: {
    solo: `Place Subject A full body, head to toe, standing upright and ready to dance in the middle of a front yard at night decorated for Halloween: glowing jack-o'-lanterns on the grass, string lights on the house, a little low fog. If Subject A is a pet, show it standing on its hind legs. No other main characters.`,
    duo: `Place Subject A on the left and Subject B on the right, both full body, head to toe, standing upright and ready to dance side by side in a front yard at night decorated for Halloween: glowing jack-o'-lanterns on the grass, string lights on the house, a little low fog. If either subject is a pet, show it standing on its hind legs.`,
  },
};

const PERFORMANCES: Record<
  ThemeStyle<'thriller'>,
  { solo: string; duo: string }
> = {
  street: {
    solo: `The lead dancer and the zombie crowd behind them perform a synchronized classic 1980s zombie dance routine: stiff claw hands, sharp shoulder shrugs, head snaps to the side, shuffling side-steps and a slow lurch forward, all moving in unison.`,
    duo: `Both lead dancers and the zombie crowd behind them perform a synchronized classic 1980s zombie dance routine: stiff claw hands, sharp shoulder shrugs, head snaps to the side, shuffling side-steps and a slow lurch forward, all moving in unison.`,
  },
  reveal: {
    solo: `For the first two seconds the face stays perfectly still like a portrait. Then the camera smoothly pulls back to reveal the full body on the foggy street with a zombie crowd behind, and everyone breaks into a synchronized zombie dance: stiff claw hands, shoulder shrugs, head snaps and shuffling side-steps.`,
    duo: `For the first two seconds both faces stay perfectly still like a portrait. Then the camera smoothly pulls back to reveal both full bodies on the foggy street with a zombie crowd behind, and everyone breaks into a synchronized zombie dance: stiff claw hands, shoulder shrugs, head snaps and shuffling side-steps.`,
  },
  jacket: {
    solo: `The lead dancer in the red jacket and the crowd behind perform a sharp, synchronized 1980s zombie dance: claw hands, shoulder shrugs, head snaps, hip swings and shuffling side-steps, then a confident pose to finish.`,
    duo: `Both red-jacket dancers and the crowd behind perform a sharp, synchronized 1980s zombie dance: claw hands, shoulder shrugs, head snaps, hip swings and shuffling side-steps, then a confident pose together to finish.`,
  },
  yard: {
    solo: `The subject does a playful zombie dance among the pumpkins: raising claw-like hands or paws, swaying side to side, shrugging the shoulders and stepping to the beat.`,
    duo: `Both subjects do a playful zombie dance together among the pumpkins: raising claw-like hands or paws, swaying side to side, shrugging the shoulders and stepping to the beat in unison.`,
  },
};

export function buildThrillerScenePrompt({ variant, solo }: ThrillerLook) {
  const people = solo
    ? `Extract the main subject (a person or a pet) from the uploaded photo, removing the original background and all other people.
Composite exactly this subject into one photorealistic, cinematic Halloween night scene. Do not duplicate them.`
    : `Extract the main subject (a person or a pet) from each uploaded photo, removing both original backgrounds and all other people.
Composite exactly these two subjects into one photorealistic, cinematic Halloween night scene. Do not make a collage or duplicate either subject.`;
  const subjects = solo
    ? 'Subject A is the subject in the uploaded image.'
    : 'Subject A is the subject in the first uploaded image; Subject B is the subject in the second uploaded image.';
  return `${people}
${SCENES[variant][solo ? 'solo' : 'duo']}
Use a tall vertical 9:16 composition with moody, cinematic night lighting.
Preserve each subject's identity, face, hairstyle and body proportions${variant === 'jacket' ? '' : ', and clothing'}.
Keep it fun and theatrical, not gory: no blood or wounds on the main subjects.
No text, logos, brand names or watermarks anywhere in the image.
${subjects}`;
}

export function buildThrillerPerformancePrompt(
  length: DuetLength,
  { variant, solo }: ThrillerLook
) {
  const who = solo ? 'the main subject' : 'both main subjects';
  return `Animate the first frame into a ${DUET_LENGTHS[length]}-second original Halloween zombie dance music video.
Preserve the identity, face and outfit of ${who} throughout.
${PERFORMANCES[variant][solo ? 'solo' : 'duo']}
Audio direction: an original spooky 1980s funk-pop instrumental with a punchy drum machine, slap synth bass, eerie synth pads, a creaking-door sound and a short evil laugh. No vocals or lyrics. No borrowed song, melody or voice imitation.
Keep the main ${solo ? 'subject' : 'subjects'} in frame and the motion smooth and rhythmic. No cuts, identity changes, gore, subtitles or logos.`;
}
