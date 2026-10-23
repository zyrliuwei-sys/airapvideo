import { createFileRoute, redirect } from '@tanstack/react-router';

// Legacy URL from an earlier version of the site: send visitors (and any
// existing links) to the homepage permanently.
export const Route = createFileRoute('/ai-livestream')({
  beforeLoad: () => {
    throw redirect({ to: '/', statusCode: 301 });
  },
});
