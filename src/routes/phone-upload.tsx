import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Loader2, Upload } from 'lucide-react';

import { envConfigs } from '@/config';
import { ApiError, apiPut } from '@/lib/api-client';
import { photoToDataUrl } from '@/lib/photo';
import { m } from '@/paraglide/messages.js';

import '@/styles/brand.css';
import '@/styles/phone-upload.css';

type SlotState = 'idle' | 'sending' | 'sent';

export const Route = createFileRoute('/phone-upload')({
  head: () => ({
    meta: [
      { title: `${m['phone_upload.page_title']()} | ${envConfigs.app_name}` },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: PhoneUploadPage,
});

function PhoneUploadPage() {
  // The session token travels in the URL hash, so it never reaches server logs.
  const [token, setToken] = useState<string>();
  const [expired, setExpired] = useState(false);
  const [slots, setSlots] = useState<Record<'a' | 'b', SlotState>>({
    a: 'idle',
    b: 'idle',
  });
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (/^[a-f\d-]{72}$/i.test(hash)) setToken(hash);
    else setExpired(true);
  }, []);

  const send = async (slot: 'a' | 'b', file: File | undefined) => {
    if (!file || !token) return;
    setSlots((s) => ({ ...s, [slot]: 'sending' }));
    try {
      const photo = await photoToDataUrl(file);
      await apiPut('/api/phone-upload', { token, slot, photo });
      setSlots((s) => ({ ...s, [slot]: 'sent' }));
    } catch (error) {
      setSlots((s) => ({ ...s, [slot]: 'idle' }));
      if (error instanceof ApiError && /expired/i.test(error.message))
        setExpired(true);
      else alert(m['studio.photo_error']());
    }
  };

  const labels = {
    a: m['hotel.create.person_a'](),
    b: m['hotel.create.person_b'](),
  };
  const done = slots.a === 'sent' && slots.b === 'sent';

  return (
    <main className="pu-page">
      <img src="/logo.svg" alt="" width={44} height={44} />
      <h1>{m['phone_upload.page_title']()}</h1>
      {expired ? (
        <p className="pu-note pu-error">{m['phone_upload.expired']()}</p>
      ) : (
        <>
          <p className="pu-note">{m['phone_upload.page_description']()}</p>
          <div className="pu-slots">
            {(['a', 'b'] as const).map((slot) => (
              <label
                key={slot}
                className={`pu-slot ${slots[slot] === 'sent' ? 'pu-slot-sent' : ''}`}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={!token || slots[slot] === 'sending'}
                  onChange={(e) => {
                    send(slot, e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <span className="pu-slot-label">{labels[slot]}</span>
                <span className="pu-slot-action">
                  {slots[slot] === 'sending' ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {m['phone_upload.sending']()}
                    </>
                  ) : slots[slot] === 'sent' ? (
                    <>
                      <Check size={18} />
                      {m['phone_upload.sent_change']()}
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      {m['phone_upload.pick']()}
                    </>
                  )}
                </span>
              </label>
            ))}
          </div>
          {done && (
            <p className="pu-note pu-done">{m['phone_upload.done']()}</p>
          )}
        </>
      )}
    </main>
  );
}
