import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { VideoGallery } from '@/blocks/video-gallery';
import { TextField } from '@/components/form-field';
import { Button } from '@/components/ui/button';

import '@/styles/rap-video.css';

export function VideoLibrary() {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(
      new URLSearchParams(window.location.search).get('link') === 'expired'
    );
  }, []);
  const recover = useMutation({
    mutationFn: (email: string) =>
      apiPost('/api/video-access/recover', { email }),
  });
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: z.object({ email: z.email().max(191) }) },
    onSubmit: async ({ value }) => {
      await recover
        .mutateAsync(value.email.trim().toLowerCase())
        .catch(() => {});
    },
  });
  return (
    <div className="rv-page">
      <Header />
      <main className="rv-library mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <VideoGallery guest />
        <section className="border-border mx-6 mt-8 max-w-lg space-y-4 border-t pt-8">
          <h2 className="text-xl">{m['guest.recover_title']()}</h2>
          <p className="text-sm opacity-70">{m['guest.recover_hint']()}</p>
          {expired && (
            <p role="alert" className="text-sm">
              {m['guest.link_expired']()}
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="email">
              {(field) => (
                <TextField
                  field={field}
                  label={m['guest.recover_email']()}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={recover.isPending}
                />
              )}
            </form.Field>
            <Button type="submit" disabled={recover.isPending}>
              {recover.isPending
                ? m['guest.sending']()
                : m['guest.recover_send']()}
            </Button>
          </form>
          {recover.isSuccess && (
            <p role="status" className="text-sm">
              {m['guest.recover_sent']()}
            </p>
          )}
          {recover.isError && (
            <p role="alert" className="text-sm">
              {m['guest.recover_error']()}
            </p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
