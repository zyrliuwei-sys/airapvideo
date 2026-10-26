import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
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
 * The session outlives the dialog, so swapping a photo on the phone later
 * still updates this page; it ends when generation starts or it expires.
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
  const openRef = useRef(open);
  openRef.current = open;

  const session = useMutation({
    mutationFn: () =>
      apiPost<{ token: string; expiresAt: number }>('/api/phone-upload'),
  });
  const token = session.data?.token;

  const poll = useQuery({
    queryKey: ['phone-upload', token],
    queryFn: () =>
      apiGet<Partial<Record<Slot, string>>>(`/api/phone-upload?token=${token}`),
    enabled: !!token && !disabled,
    // Faster while the QR dialog is up; slower once it's closed.
    refetchInterval: open ? 2000 : 4000,
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
      if (!openRef.current) toast.success(m['phone_upload.updated']());
    }
  }, [poll.data]);

  const end = () => {
    if (token) apiDelete(`/api/phone-upload?token=${token}`).catch(() => {});
    session.reset();
  };
  // Expired session: drop it so the next click shows a fresh code.
  const expired = !!poll.error?.message && /expired/i.test(poll.error.message);
  useEffect(() => {
    if (expired && !openRef.current) session.reset();
  }, [expired]);
  // Generation started: the photos are locked in, stop listening.
  useEffect(() => {
    if (disabled && token) end();
  }, [disabled]);
  // Both photos in: close shortly after so the "added" state is visible.
  useEffect(() => {
    if (!open || !received.a || !received.b) return;
    const timer = setTimeout(() => setOpen(false), 1200);
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
  return (
    <>
      <button
        type="button"
        className="pu-trigger"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          // Reuse a live session so the phone page already open keeps working.
          if (token && !expired) return;
          setReceived({ a: false, b: false });
          session.mutate();
        }}
      >
        <span className="pu-trigger-icon" aria-hidden="true">
          <QrCode size={22} />
        </span>
        <span className="pu-trigger-text">
          <span className="pu-trigger-title">{m['phone_upload.button']()}</span>
          <span className="pu-trigger-hint">
            {m['phone_upload.button_hint']()}
          </span>
        </span>
        <ArrowRight size={18} className="pu-trigger-arrow" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
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
