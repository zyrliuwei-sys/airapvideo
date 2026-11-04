import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { roadMedia } from '@/config/hit-the-road';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { HitTheRoadPage, ROAD_FAQ } from '@/blocks/hit-the-road';

export const Route = createFileRoute('/hit-the-road-dude-ai')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const title = m['road.meta.title']({}, { locale });
    const description = m['road.meta.description']({}, { locale });
    const urlFor = (loc: (typeof locales)[number]) =>
      localizeUrl(new URL('/hit-the-road-dude-ai', envConfigs.app_url), {
        locale: loc,
      }).href;
    const url = urlFor(locale);
    const home = localizeUrl(new URL('/', envConfigs.app_url), { locale }).href;
    const image = new URL(roadMedia('cat').poster, envConfigs.app_url).href;
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
        {
          property: 'og:image:alt',
          content: m['road.examples.cat.title']({}, { locale }),
        },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      links: [
        { rel: 'canonical', href: url },
        {
          rel: 'preload',
          as: 'image',
          href: roadMedia('cat').poster,
          fetchPriority: 'high',
        },
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
                '@type': 'CollectionPage',
                '@id': `${url}#page`,
                url,
                name: title,
                description,
                inLanguage: locale,
                image,
                isPartOf: {
                  '@type': 'WebSite',
                  name: envConfigs.app_name,
                  url: home,
                },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: m['road.home']({}, { locale }),
                    item: home,
                  },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: m['road.nav']({}, { locale }),
                    item: url,
                  },
                ],
              },
              {
                '@type': 'FAQPage',
                mainEntity: ROAD_FAQ.map(([question, answer]) => ({
                  '@type': 'Question',
                  name: question({}, { locale }),
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: answer({}, { locale }),
                  },
                })),
              },
            ],
          }).replace(/</g, '\\u003c'),
        },
      ],
    };
  },
  component: HitTheRoadPage,
});
