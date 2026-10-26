import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const rules = [
          'Allow: /',
          'Disallow: /admin',
          'Disallow: /settings',
          'Disallow: /api/',
          'Disallow: /*?*',
        ];
        // AI search and assistant crawlers get the same rules, named
        // explicitly so they can cite the guides.
        const aiAgents = [
          'OAI-SearchBot',
          'ChatGPT-User',
          'GPTBot',
          'PerplexityBot',
          'ClaudeBot',
          'Claude-SearchBot',
          'Google-Extended',
          'Applebot-Extended',
        ];
        const body = [
          'User-Agent: *',
          ...rules,
          '',
          ...aiAgents.map((agent) => `User-Agent: ${agent}`),
          ...rules,
          '',
          `Sitemap: ${envConfigs.app_url}/sitemap.xml`,
          '',
        ].join('\n');
        return new Response(body, {
          headers: { 'Content-Type': 'text/plain' },
        });
      },
    },
  },
});
