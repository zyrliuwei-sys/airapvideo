import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { RapVideoPage } from '@/blocks/rap-video';

export const Route = createFileRoute('/')({
  loader: () => ({ locale: getLocale() }),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'en';
    const title = m['common.metadata.title']({}, { locale: locale as any });
    const description = m['common.metadata.description'](
      {},
      { locale: locale as any }
    );
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/`, { locale: loc as any }).href;
    const url = urlFor(locale);
    const image = `${envConfigs.app_url}/videos/examples/besties.jpg`;
    // FAQPage mirrors the FAQ shown on the page (static refs keep the
    // message tree-shaking intact).
    const faq = [
      [m['rap.faq.one.question'], m['rap.faq.one.answer']],
      [m['rap.faq.two.question'], m['rap.faq.two.answer']],
      [m['rap.faq.three.question'], m['rap.faq.three.answer']],
      [m['rap.faq.four.question'], m['rap.faq.four.answer']],
      [m['rap.faq.five.question'], m['rap.faq.five.answer']],
      [m['rap.faq.six.question'], m['rap.faq.six.answer']],
      [m['rap.faq.seven.question'], m['rap.faq.seven.answer']],
      [m['rap.faq.eight.question'], m['rap.faq.eight.answer']],
      [m['rap.faq.nine.question'], m['rap.faq.nine.answer']],
    ];
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
        // LCP: the hero clip's poster.
        {
          rel: 'preload',
          as: 'image',
          href: '/videos/examples/besties.jpg',
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
                '@type': 'WebSite',
                name: envConfigs.app_name,
                url: `${envConfigs.app_url}/`,
              },
              {
                '@type': 'WebApplication',
                name: envConfigs.app_name,
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
                mainEntity: faq.map(([question, answer]) => ({
                  '@type': 'Question',
                  name: question({}, { locale: locale as any }),
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: answer({}, { locale: locale as any }),
                  },
                })),
              },
            ],
          }),
        },
      ],
    };
  },
  component: RapVideoPage,
});
