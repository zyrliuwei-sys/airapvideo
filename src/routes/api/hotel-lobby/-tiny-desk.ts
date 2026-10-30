/**
 * Prompts for the Tiny Desk generator: an intimate office desk concert
 * instead of the orange rap booth. One photo makes a solo lead singer with
 * an AI band; two add a second singer, placed according to the style.
 */

import { DUET_LENGTHS, type DuetLength } from '@/config/hotel-lobby-pricing';
import type { ThemeStyle } from '@/config/scene-themes';

/** Look of a Tiny Desk job, saved with paid purchases until they start. */
export type DeskLook = { variant: ThemeStyle<'tinydesk'>; solo: boolean };

const ROOM = `The room is a cramped, cozy office used as a live music venue: tall bookshelves packed with books and vinyl records, plants, framed posters, small trophies and warm string lights, with a cluttered wooden desk in front holding coffee mugs and a small lamp. Warm, natural tungsten light.`;

const SCENES: Record<ThemeStyle<'tinydesk'>, { solo: string; duo: string }> = {
  band: {
    solo: `Place Subject A standing as the lead singer behind a single vintage silver microphone, waist-up, centered. Behind and around them, a full band of AI musicians who are clearly not the main subject: a keyboard player at an electric piano on the desk, a backing singer, a bassist and a saxophone player.`,
    duo: `Place Subject A standing on the left as the lead singer behind a single vintage silver microphone. Place Subject B on the right, close beside them, as the backing singer at a second microphone. Behind them, AI band musicians who are clearly not the main subjects: keys on the desk, bass and a saxophone player.`,
  },
  session: {
    solo: `Place Subject A seated behind the desk at an electric piano, wearing studio headphones, singing into a vintage microphone on a short stand. Around them, AI session musicians who are clearly not the main subject, all wearing headphones: a guitarist, a percussionist and backing singers leaning into microphones.`,
    duo: `Place Subject A seated on the left behind the desk at an electric piano, wearing studio headphones and singing into a vintage microphone. Place Subject B standing on the right, also wearing studio headphones, singing backup into their own microphone. Around them, AI session musicians in headphones who are clearly not the main subjects.`,
  },
  closeup: {
    solo: `Frame a tight, candid close-up of Subject A from the chest up, laughing joyfully mid-song right next to a vintage microphone. Out-of-focus band musicians, including a saxophone player, are visible in the background.`,
    duo: `Frame a tight, candid close-up of Subject A (left) and Subject B (right) from the chest up, cheek to cheek and laughing joyfully mid-song next to a vintage microphone. Out-of-focus band musicians, including a saxophone player, are visible in the background.`,
  },
  duet: {
    solo: `Place Subject A as the lead singer at a single vintage silver microphone, with an AI duet partner beside them who is clearly secondary.`,
    duo: `Place Subject A on the left and Subject B on the right, side by side and sharing one vintage silver microphone between them at mouth level, both singing to the camera. Softly blurred band musicians in the background.`,
  },
};

const PERFORMANCES: Record<
  ThemeStyle<'tinydesk'>,
  { solo: string; duo: string }
> = {
  band: {
    solo: `The lead singer performs joyfully: smiling, laughing between lines, eyes closed on the high notes, one hand raised. The band keeps playing behind them and the saxophone player takes a short solo.`,
    duo: `The left performer is the lead singer: joyful, laughing between lines, eyes closed on the high notes. The right performer sings warm backing harmonies and sways to the groove. The band keeps playing and the saxophone player takes a short solo.`,
  },
  session: {
    solo: `The performer plays the electric piano and sings with a big smile, nodding to the beat, while the session musicians in headphones play and sing along around the desk.`,
    duo: `The left performer plays the electric piano and sings lead; the right performer sings backup and claps on the beat. The session musicians in headphones play and sing along around the desk.`,
  },
  closeup: {
    solo: `The performer sings a soulful line, then bursts into a big, warm laugh, then keeps singing while the saxophone player behind them takes a short solo.`,
    duo: `Both performers sing a soulful line together, crack up laughing at each other, then keep singing while the saxophone player behind them takes a short solo.`,
  },
  duet: {
    solo: `The lead singer performs joyfully into the shared microphone while the duet partner answers with harmonies.`,
    duo: `The two performers trade lines and then sing the chorus together into the shared microphone, smiling at each other between lines.`,
  },
};

export function buildDeskScenePrompt({ variant, solo }: DeskLook) {
  const people = solo
    ? `Extract the main person from the uploaded photo, removing the original background and all other people.
Composite exactly this person into one photorealistic still from an intimate live desk concert. Do not duplicate them.`
    : `Extract the main person from each uploaded photo, removing both original backgrounds and all other people.
Composite exactly these two people into one photorealistic still from an intimate live desk concert. Do not make a collage or duplicate either person.`;
  const subjects = solo
    ? 'Subject A is the person in the uploaded image.'
    : 'Subject A is the person in the first uploaded image; Subject B is the person in the second uploaded image.';
  return `${people}
${SCENES[variant][solo ? 'solo' : 'duo']}
${ROOM}
Use a tall vertical 9:16 composition with a slightly candid live-session camera angle.
Preserve each person's identity, face, hairstyle, body proportions, and clothing.
No text, logos, brand names or watermarks anywhere in the image.
${subjects}`;
}

export function buildDeskPerformancePrompt(
  length: DuetLength,
  { variant, solo }: DeskLook
) {
  const who = solo ? 'the main performer' : 'both main performers';
  return `Animate the first frame into a ${DUET_LENGTHS[length]}-second original live desk-concert music video, in the style of an intimate office concert session.
Preserve the identity, face and outfit of ${who}, their positions, the microphone, the desk and the cozy bookshelf office throughout.
${PERFORMANCES[variant][solo ? 'solo' : 'duo']}
Audio direction: an original upbeat funk and soul groove with electric piano, slap bass, tight drums and a bright saxophone line, with an intelligible original English lead vocal and backing harmonies. Match each visible singer's mouth to the syllables of their own voice. No borrowed song, melody or voice imitation.
Keep a steady, slightly handheld live-session camera and the source framing. No cuts, identity changes, extra lead singers, subtitles or logos.`;
}
