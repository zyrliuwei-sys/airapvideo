import { createFileRoute } from '@tanstack/react-router';

import { VideoGallery } from '@/blocks/video-gallery';

export const Route = createFileRoute('/settings/videos')({
  component: VideoGallery,
});
