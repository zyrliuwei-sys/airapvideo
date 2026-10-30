import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { THRILLER_FAQ, ThrillerDancePage } from '@/blocks/thriller-dance';

export const Route = createFileRoute('/thriller-dance')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = (loaderData?.locale ?? 'en') as any;
    const title = m['thriller.meta.title']({}, { locale });
    const description = m['thriller.meta.description']({}, { locale });
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/thriller-dance`, {
        locale: loc as any,
      }).href;
    const url = urlFor(locale);
    const image = `${envConfigs.app_url}/videos/thriller/zombie-street.jpg`;
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
          href: '/videos/thriller/zombie-street.jpg',
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
                mainEntity: THRILLER_FAQ.map(([question, answer]) => ({
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
  component: ThrillerDancePage,
});
