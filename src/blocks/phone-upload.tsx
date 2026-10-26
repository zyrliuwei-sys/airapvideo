import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Smartphone } from 'lucide-react';
import { renderSVG } from 'uqr';

import { apiDelete, apiGet, apiPost } from '@/lib/api-client';
import { dataUrlToFile } from '@/lib/photo';
import { m } from '@/paraglide/messages.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import '@/styles/phone-upload.css';

type Slot = 'a' | 'b';

/**
 * "Upload from your phone": shows a QR code that opens /phone-upload on the
 * phone; photos picked there are polled here and handed to `onPhoto`.
 */
export function PhoneUpload({
  onPhoto,
  disabled,
}: {
  onPhoto: (slot: Slot, file: File) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<Record<Slot, boolean>>({
    a: false,
    b: false,
  });
  const onPhotoRef = useRef(onPhoto);
  onPhotoRef.current = onPhoto;

  const session = useMutation({
    mutationFn: () =>
      apiPost<{ token: string; expiresAt: number }>('/api/phone-upload'),
  });
  const token = session.data?.token;

  const poll = useQuery({
    queryKey: ['phone-upload', token],
    queryFn: () =>
      apiGet<Partial<Record<Slot, string>>>(`/api/phone-upload?token=${token}`),
    enabled: open && !!token,
    refetchInterval: 2000,
    // Keep polling while the user is busy on the phone and this tab is hidden.
    refetchIntervalInBackground: true,
    gcTime: 0,
  });
  useEffect(() => {
    const photos = poll.data;
    if (!photos) return;
    for (const slot of ['a', 'b'] as const) {
      const photo = photos[slot];
      if (!photo) continue;
      onPhotoRef.current(slot, dataUrlToFile(photo, `phone-${slot}.jpg`));
      setReceived((r) => ({ ...r, [slot]: true }));
    }
  }, [poll.data]);

  const close = () => {
    setOpen(false);
    if (token) apiDelete(`/api/phone-upload?token=${token}`).catch(() => {});
    session.reset();
  };
  // Both photos in: close shortly after so the "added" state is visible.
  useEffect(() => {
    if (!open || !received.a || !received.b) return;
    const timer = setTimeout(close, 1200);
    return () => clearTimeout(timer);
  }, [open, received.a, received.b]);

  const qr = useMemo(
    () =>
      token
        ? renderSVG(`${window.location.origin}/phone-upload#${token}`, {
            border: 0,
          })
        : '',
    [token]
  );
  const expired = poll.error?.message && /expired/i.test(poll.error.message);

  return (
    <>
      <button
        type="button"
        className="pu-trigger"
        disabled={disabled}
        onClick={() => {
          setReceived({ a: false, b: false });
          setOpen(true);
          session.mutate();
        }}
      >
        <Smartphone size={16} />
        {m['phone_upload.button']()}
      </button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{m['phone_upload.title']()}</DialogTitle>
            <DialogDescription>
              {m['phone_upload.description']()}
            </DialogDescription>
          </DialogHeader>
          {session.isError || expired ? (
            <p className="text-destructive text-sm">
              {expired
                ? m['phone_upload.expired']()
                : m['phone_upload.error']()}
            </p>
          ) : qr ? (
            <div
              className="pu-qr"
              role="img"
              aria-label={m['phone_upload.title']()}
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <div className="pu-qr">
              <Loader2 className="animate-spin text-black" />
            </div>
          )}
          <div className="pu-status" aria-live="polite">
            {(['a', 'b'] as const).map((slot) => (
              <span
                key={slot}
                className={`pu-chip ${received[slot] ? 'pu-chip-done' : ''}`}
              >
                {received[slot] && <Check size={14} />}
                {slot === 'a'
                  ? m['hotel.create.person_a']()
                  : m['hotel.create.person_b']()}
                {' · '}
                {received[slot]
                  ? m['phone_upload.received']()
                  : m['phone_upload.waiting']()}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-center text-xs">
            {m['phone_upload.expires']()}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
