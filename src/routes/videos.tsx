import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { VideoLibrary } from '@/blocks/video-library';

export const Route = createFileRoute('/videos')({
  head: () => ({
    meta: [
      { title: `${m['settings.videos.title']()} | ${envConfigs.app_name}` },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: VideoLibrary,
});
