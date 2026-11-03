import type { FooterBadge } from './types';
import { validateFooterBadges } from './validation';

const SAFE_ELEMENTS = new Set([
  'A',
  'IMG',
  'DIV',
  'SPAN',
  'P',
  'FIGURE',
  'STRONG',
  'EM',
  'SMALL',
  'B',
  'I',
  'BR',
]);

function dimension(image: Element, name: 'width' | 'height') {
  const attribute = image.getAttribute(name);
  if (attribute !== null) return Number(attribute);
  // Read pixel dimensions only. Never render the supplied stylesheet or attributes.
  const match = image
    .getAttribute('style')
    ?.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(\\d+)px\\s*(?:;|$)`, 'i'));
  return match ? Number(match[1]) : undefined;
}

/** Extract data from ordinary directory badges; pasted HTML is never rendered. */
export function parseFooterBadgeMarkup(markup: string): FooterBadge[] {
  if (!markup.trim() || markup.length > 20_000)
    throw new Error('invalid_markup');
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  // DOMParser can move script/style/link tags into <head>; inspect both trees.
  if (doc.head.children.length) throw new Error('invalid_markup');
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (
      !SAFE_ELEMENTS.has(element.tagName) ||
      Array.from(element.attributes).some((attribute) =>
        /^on/i.test(attribute.name)
      )
    ) {
      throw new Error('invalid_markup');
    }
    if (element.tagName === 'IMG' && !element.closest('a[href]')) {
      throw new Error('invalid_markup');
    }
  }

  const anchors = Array.from(doc.body.querySelectorAll('a[href]'));
  if (!anchors.length) throw new Error('invalid_markup');
  const badges = anchors.map((anchor) => {
    const images = Array.from(anchor.querySelectorAll('img'));
    if (images.length > 1) throw new Error('invalid_markup');
    const image = images[0];
    const href = anchor.getAttribute('href') ?? '';
    const text = anchor.textContent?.replace(/\s+/g, ' ').trim();
    const alt =
      image?.getAttribute('alt')?.trim() ||
      anchor.getAttribute('aria-label')?.trim() ||
      text ||
      anchor.getAttribute('title')?.trim() ||
      (image ? new URL(href).hostname : '');
    return {
      href,
      ...(image ? { src: image.getAttribute('src') ?? '' } : {}),
      alt,
      rel: anchor.getAttribute('rel') ?? undefined,
      width: image ? dimension(image, 'width') : undefined,
      height: image ? dimension(image, 'height') : undefined,
    };
  });
  return validateFooterBadges(badges);
}
