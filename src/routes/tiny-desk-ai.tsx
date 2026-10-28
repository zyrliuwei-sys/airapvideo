import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { TINY_DESK_FAQ, TinyDeskPage } from '@/blocks/tiny-desk';

export const Route = createFileRoute('/tiny-desk-ai')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = (loaderData?.locale ?? 'en') as any;
    const title = m['tinydesk.meta.title']({}, { locale });
    const description = m['tinydesk.meta.description']({}, { locale });
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/tiny-desk-ai`, { locale: loc as any })
        .href;
    const url = urlFor(locale);
    const image = `${envConfigs.app_url}/videos/tiny-desk/mini-desk.jpg`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: envConfigs.app_name },
        { property: 'og:url', content: url },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: image },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      links: [
        // LCP: the generator's idle demo clip poster.
        {
          rel: 'preload',
          as: 'image',
          href: '/videos/tiny-desk/mini-desk.jpg',
          fetchPriority: 'high',
        },
        { rel: 'canonical', href: url },
        ...locales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: urlFor(loc),
        })),
        { rel: 'alternate', hrefLang: 'x-default', href: urlFor('en') },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebApplication',
                name: title,
                url,
                description,
                image,
                applicationCategory: 'MultimediaApplication',
                operatingSystem: 'Web browser',
                offers: {
                  '@type': 'Offer',
                  price: '9.90',
                  priceCurrency: 'USD',
                },
              },
              {
                '@type': 'FAQPage',
                mainEntity: TINY_DESK_FAQ.map(([question, answer]) => ({
                  '@type': 'Question',
                  name: question({}, { locale }),
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: answer({}, { locale }),
                  },
                })),
              },
            ],
          }),
        },
      ],
    };
  },
  component: TinyDeskPage,
});
