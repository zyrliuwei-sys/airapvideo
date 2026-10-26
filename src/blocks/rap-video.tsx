import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  Crop,
  Download,
  Loader2,
  Lock,
  RotateCcw,
  Smartphone,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import {
  DEFAULT_DUET_LENGTH,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import {
  DEFAULT_DUET_SIZE,
  OFFERED_DUET_SIZES,
  type DuetSize,
} from '@/config/hotel-lobby-sizes';
import { apiGet, apiPost } from '@/lib/api-client';
import { draftDelete, draftGet, draftSet } from '@/lib/draft-store';
import { track } from '@/lib/track';
import { m } from '@/paraglide/messages.js';
import { localizeHref } from '@/paraglide/runtime.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { Footer } from '@/blocks/footer';
import { Guides } from '@/blocks/guides';
import { Header } from '@/blocks/header';
import { Pricing } from '@/blocks/pricing';

import '@/styles/rap-video.css';

// The paywall is only needed when a visitor starts the paid flow: keep its
// dialog code out of the homepage's initial JS.
const PaywallDialog = lazy(() => import('@/blocks/paywall-dialog'));

// Example clips (muted loops) with their JPEG posters.
const clip = (name: string) => ({
  src: `/videos/examples/${name}.mp4`,
  poster: `/videos/examples/${name}.jpg`,
});
const demoClip = clip('besties');
const coupleClip = clip('couple');
const familyClip = clip('grandpa');
const birthdayClip = clip('bday');

const IDEAS = [
  {
    name: 'couple',
    ...coupleClip,
    title: m['rap.ideas.friends.title'],
    text: m['rap.ideas.friends.text'],
    short: m['rap.ideas.friends.short'],
  },
  {
    name: 'family',
    ...familyClip,
    title: m['rap.ideas.battle.title'],
    text: m['rap.ideas.battle.text'],
    short: m['rap.ideas.battle.short'],
  },
  {
    name: 'birthday',
    ...birthdayClip,
    title: m['rap.ideas.couples.title'],
    text: m['rap.ideas.couples.text'],
    short: m['rap.ideas.couples.short'],
  },
];

/** Muted looping clip that only plays while it is on screen. */
function LoopVideo({
  src,
  poster,
  label,
  className,
  eager,
  muted = true,
}: {
  src: string;
  poster: string;
  label?: string;
  className?: string;
  eager?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // React doesn't update the `muted` attribute after mount; set the property.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = muted;
    // Unmuting is a user tap: restart the clip so the verse plays from the top.
    if (!muted) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [muted]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: '200px' }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      className={className}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      muted
      loop
      playsInline
      preload={eager ? 'auto' : 'none'}
    />
  );
}

// Finished duets shown as "what you get" (public/videos/showcase/). The
// generator always renders the orange booth, so those clips lead the grid.
const showcaseClip = (path: string) => ({
  src: `/videos/${path}.mp4`,
  poster: `/videos/${path}.jpg`,
});
const SHOWCASE = [
  {
    ...showcaseClip('showcase/orange-mic'),
    label: m['rap.showcase.clip.orange_mic'],
  },
  {
    ...showcaseClip('showcase/orange-duo'),
    label: m['rap.showcase.clip.orange_duo'],
    audio: true,
  },
  {
    ...showcaseClip('showcase/cat-corgi'),
    label: m['rap.showcase.clip.cat_corgi'],
  },
  {
    ...showcaseClip('showcase/dog-cat'),
    label: m['rap.showcase.clip.dog_cat'],
    audio: true,
  },
  {
    ...showcaseClip('showcase/roast-battle'),
    label: m['rap.showcase.clip.roast'],
    audio: true,
  },
  {
    ...showcaseClip('showcase/street-grandpas'),
    label: m['rap.showcase.clip.grandpas'],
    audio: true,
  },
  {
    ...showcaseClip('showcase/lobby-duo'),
    label: m['rap.showcase.clip.lobby_duo'],
    audio: true,
  },
  {
    ...showcaseClip('showcase/hotel-lobby'),
    label: m['rap.showcase.clip.hotel_lobby'],
  },
  { ...showcaseClip('examples/cowork'), label: m['rap.showcase.clip.cowork'] },
  { ...showcaseClip('examples/couple'), label: m['rap.showcase.clip.rooftop'] },
];
// Smaller 4:5 clips for the "more ideas" wall (public/videos/showcase/more/).
const MORE_CLIPS = Array.from({ length: 15 }, (_, i) =>
  showcaseClip(`showcase/more/${String(i + 1).padStart(2, '0')}`)
);

/** Grid of finished duets; at most one clip plays with sound at a time. */
function Showcase() {
  const [voiced, setVoiced] = useState<string | null>(null);
  return (
    <section className="rv-showcase" aria-labelledby="showcase-heading">
      <div className="rv-head">
        <p className="rv-eyebrow">{m['rap.showcase.eyebrow']()}</p>
        <h2 id="showcase-heading">{m['rap.showcase.title']()}</h2>
        <p>{m['rap.showcase.description']()}</p>
      </div>
      <div className="rv-showcase-grid">
        {SHOWCASE.map((item) => (
          <figure key={item.src}>
            <LoopVideo
              src={item.src}
              poster={item.poster}
              label={item.label()}
              muted={voiced !== item.src}
            />
            {item.audio && (
              <button
                type="button"
                className="rv-showcase-sound"
                aria-pressed={voiced === item.src}
                aria-label={
                  voiced === item.src
                    ? m['rap.showcase.sound_off']()
                    : m['rap.showcase.sound_on']()
                }
                onClick={() =>
                  setVoiced((v) => (v === item.src ? null : item.src))
                }
              >
                {voiced === item.src ? (
                  <Volume2 size={16} />
                ) : (
                  <VolumeX size={16} />
                )}
              </button>
            )}
            <figcaption>{item.label()}</figcaption>
          </figure>
        ))}
      </div>
      <h3 className="rv-showcase-more-title">{m['rap.showcase.more']()}</h3>
      <div className="rv-showcase-more">
        {MORE_CLIPS.map((clip) => (
          <LoopVideo
            key={clip.src}
            {...clip}
            label={m['rap.showcase.more_alt']()}
          />
        ))}
      </div>
      <p className="rv-showcase-note">{m['rap.showcase.note']()}</p>
      <div className="rv-actions">
        <a href="#create" className="br-btn">
          {m['rap.showcase.cta']()} <ArrowRight size={18} />
        </a>
      </div>
    </section>
  );
}

const INSUFFICIENT_CREDITS = 'Insufficient credits';

type DuetTask = {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  stage: 'scene' | 'motion' | null;
  sceneImageUrl: string | null;
  videoUrl: string | null;
  error: string | null;
  emailProvided?: boolean;
};

type DuetPreview = {
  id: string;
  status: 'pending' | 'success' | 'failed';
  size: string;
  imageUrl: string | null;
  animatedTaskId: string | null;
  error: string | null;
};

const DIRECTION_BLOCKED = 'DIRECTION_BLOCKED';

type Saved = {
  previewId?: string;
  taskId?: string;
  purchaseId?: string;
  at: number;
};
const SAVED_KEY = 'hl-duet';
const SAVED_TTL = 3 * 24 * 60 * 60 * 1000;

// Unsent form (photos + options) kept in IndexedDB so it survives the
// sign-in redirect (Google OAuth leaves the site) and reloads. Device-local,
// never uploaded; dropped after a day.
type Draft = {
  photoA: File | null;
  photoB: File | null;
  at: number;
};
const DRAFT_KEY = 'hl-create-draft';
const DRAFT_TTL = 24 * 60 * 60 * 1000;

function loadSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    return saved && Date.now() - saved.at < SAVED_TTL ? saved : null;
  } catch {
    return null;
  }
}

function saveState(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    // Private mode / blocked storage: the flow still works, just not resumable.
  }
}

// Free stills are drawn onto a canvas with a tiled watermark, so neither
// "save image" nor a screenshot yields a clean frame.
function WatermarkedImage({
  src,
  alt,
  label,
  onError,
}: {
  src: string;
  alt: string;
  label: string;
  onError: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const step = Math.max(canvas.width, canvas.height) / 5;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.font = `700 ${Math.round(step / 6)}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.textAlign = 'center';
      const span = Math.max(canvas.width, canvas.height) * 1.5;
      const gap = ctx.measureText(label).width + step * 0.6;
      for (let y = -span, row = 0; y < span; y += step, row++) {
        for (let x = -span; x < span; x += gap) {
          ctx.fillText(label, x + (row % 2) * (gap / 2), y);
        }
      }
      ctx.restore();
    };
    img.onerror = onError;
    // Fetched as a blob (not <img src>) so the request is a plain API call;
    // dev servers treat image-destination requests as static assets.
    let objectUrl: string | undefined;
    let cancelled = false;
    fetch(src)
      .then((res) => (res.ok ? res.blob() : Promise.reject(res.status)))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      })
      .catch(() => !cancelled && onError());
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, label]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// Downscale to ≤1536px JPEG; the server uploads both portraits to EvoLink.
async function toDataUrl(file: File, maxSide = 1536): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

function PhotoInput({
  label,
  side,
  file,
  onFile,
  disabled,
}: {
  label: string;
  side: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  // Derived from the file prop so a draft restored after sign-in shows too.
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) return setPreview(undefined);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="rv-photo-slot">
      <div className="rv-photo-label">
        <span>{label}</span>
        <small>{side}</small>
      </div>
      <div className="rv-upload-wrap">
        <label
          className={`rv-upload ${preview ? 'rv-upload-filled' : ''} ${disabled ? 'rv-upload-disabled' : ''}`}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={label}
            disabled={disabled}
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              if (selected && selected.size > 10 * 1024 * 1024) {
                alert(m['hotel.upload_limit']());
                e.target.value = '';
                return;
              }
              if (selected) {
                if (
                  !['image/jpeg', 'image/png', 'image/webp'].includes(
                    selected.type
                  )
                ) {
                  toast.error(m['studio.photo_error']());
                } else {
                  onFile(selected);
                  track('hl_photo_upload');
                }
              }
              e.target.value = '';
            }}
          />
          {preview && (
            <img src={preview} alt={label} className="rv-upload-preview" />
          )}
          <span className="rv-upload-content">
            <span className="rv-upload-icon">
              <Upload size={23} strokeWidth={1.5} />
            </span>
            <span className="rv-upload-title">
              {preview
                ? m['studio.change_photo']()
                : m['studio.choose_photo']()}
            </span>
            {!preview && (
              <span className="rv-upload-subtitle">
                {m['studio.portrait_hint']()}
              </span>
            )}
          </span>
        </label>
        {file && (
          <button
            type="button"
            className="rv-photo-remove"
            disabled={disabled}
            aria-label={m['studio.remove_photo']({ person: label })}
            onClick={() => onFile(null)}
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function RapVideoPage() {
  const [photoA, setPhotoA] = useState<File | null>(null);
  const [photoB, setPhotoB] = useState<File | null>(null);
  const size = DEFAULT_DUET_SIZE;
  const length = DEFAULT_DUET_LENGTH;
  const [previewId, setPreviewId] = useState<string>();
  const [taskId, setTaskId] = useState<string>();
  const [purchaseId, setPurchaseId] = useState<string>();
  const purchaseDraft = useRef<string | undefined>(undefined);
  const [activeIdea, setActiveIdea] = useState(0);
  const { data: session } = useSession();
  const user = session?.user;
  const canGenerate = !!photoA && !!photoB;
  const queryClient = useQueryClient();
  const [paywall, setPaywall] = useState(false);
  // Mount the (lazy) paywall dialog on first open and keep it mounted, so
  // its close animation and later opens behave as before.
  const [paywallMounted, setPaywallMounted] = useState(false);
  if (paywall && !paywallMounted) setPaywallMounted(true);

  // Survive the sign-in / checkout round trip and reloads mid-generation:
  // the preview and task ids live in localStorage, photos aren't needed again.
  useEffect(() => {
    const saved = loadSaved();
    const returnedPurchase = new URLSearchParams(window.location.search).get(
      'purchase'
    );
    if (returnedPurchase && /^[a-f\d-]{36}$/i.test(returnedPurchase)) {
      setPurchaseId(returnedPurchase);
      purchaseDraft.current = returnedPurchase;
    } else if (saved?.purchaseId) {
      setPurchaseId(saved.purchaseId);
      purchaseDraft.current = saved.purchaseId;
    }
    if (!saved) return;
    setPreviewId(saved.previewId);
    setTaskId(saved.taskId);
    if (Date.now() - saved.at < 2 * 60 * 60 * 1000) {
      setTimeout(
        () =>
          document
            .getElementById('create')
            ?.scrollIntoView({ behavior: 'smooth' }),
        300
      );
    }
  }, []);
  // Funnel step 1 (first-party event table + GA). The page HTML is
  // edge-cached, so the view is counted from the browser.
  useEffect(() => track('hl_home_view'), []);
  // Arriving at /#create (e.g. straight after sign-in / sign-up): the browser's
  // own anchor jump fires before images settle the layout, so scroll again.
  useEffect(() => {
    if (window.location.hash !== '#create') return;
    const timer = setTimeout(
      () =>
        document
          .getElementById('create')
          ?.scrollIntoView({ behavior: 'smooth' }),
      300
    );
    return () => clearTimeout(timer);
  }, []);
  // Restore the unsent form, then keep it saved. `draftReady` stops the save
  // effect from overwriting the draft with the empty initial state.
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    draftGet<Draft>(DRAFT_KEY).then((d) => {
      if (d && Date.now() - d.at < DRAFT_TTL) {
        setPhotoA(d.photoA);
        setPhotoB(d.photoB);
      }
      setDraftReady(true);
    });
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    if (!photoA && !photoB) {
      draftDelete(DRAFT_KEY);
      return;
    }
    draftSet(DRAFT_KEY, {
      photoA,
      photoB,
      at: Date.now(),
    } satisfies Draft);
  }, [draftReady, photoA, photoB]);
  // Only ever written here; cleared explicitly by `forget` so a (re)mount
  // with empty state can't wipe what the restore above is about to read.
  useEffect(() => {
    if (previewId || taskId || purchaseId)
      saveState({ previewId, taskId, purchaseId, at: Date.now() });
  }, [previewId, taskId, purchaseId]);
  const forget = () => {
    saveState(null);
    setTaskId(undefined);
    setPreviewId(undefined);
    setPurchaseId(undefined);
    purchaseDraft.current = undefined;
    const url = new URL(window.location.href);
    url.searchParams.delete('purchase');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  const purchaseQuery = useQuery({
    queryKey: ['video-purchase', purchaseId],
    queryFn: () =>
      apiGet<{ status: string; taskId: string | null; emailProvided: boolean }>(
        `/api/hotel-lobby/purchase?id=${purchaseId}`
      ),
    enabled: !!purchaseId,
    refetchInterval: (q) =>
      q.state.data?.taskId || q.state.data?.status === 'draft' ? false : 4000,
  });
  useEffect(() => {
    if (!purchaseQuery.data?.taskId) return;
    setTaskId(purchaseQuery.data.taskId);
    setPaywall(false);
    queryClient.invalidateQueries({ queryKey: ['credits'] });
  }, [purchaseQuery.data?.taskId]);

  const prepareCheckout = async (email: string) => {
    if (purchaseDraft.current) return purchaseDraft.current;
    const purchase = await apiPost<{ id: string }>(
      '/api/hotel-lobby/purchase',
      {
        photoA: await toDataUrl(photoA!),
        photoB: await toDataUrl(photoB!),
        size,
        length,
        email,
      }
    );
    purchaseDraft.current = purchase.id;
    setPurchaseId(purchase.id);
    return purchase.id;
  };

  const previewQuery = useQuery({
    queryKey: ['hotel-lobby-preview', previewId],
    queryFn: () =>
      apiGet<DuetPreview>(`/api/hotel-lobby/preview?id=${previewId}`),
    enabled: !!previewId,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 4000 : false,
  });
  const preview = previewQuery.data;
  useEffect(() => {
    if (preview?.status === 'success') track('hl_preview_ready');
    // A preview animated in another tab/session: follow its task.
    if (preview?.animatedTaskId && !taskId) setTaskId(preview.animatedTaskId);
  }, [preview?.status, preview?.animatedTaskId]);
  // Saved id that no longer exists (or expired), or a not-yet-animated preview
  // in a framing no longer offered (old 1:1 / 3:4 / 16:9): forget it quietly.
  useEffect(() => {
    if (
      previewQuery.error ||
      (preview &&
        !preview.animatedTaskId &&
        !OFFERED_DUET_SIZES.includes(preview.size as DuetSize))
    ) {
      forget();
    }
  }, [previewQuery.error, preview?.size, preview?.animatedTaskId]);

  const onTaskStarted = (task: DuetTask) => {
    setTaskId(task.id);
    track('hl_video_start');
    queryClient.invalidateQueries({ queryKey: ['credits'] });
  };
  const onPaidError = (e: Error) => {
    if (e.message === INSUFFICIENT_CREDITS) openPaywall();
  };

  const animate = useMutation({
    mutationFn: () =>
      apiPost<DuetTask>('/api/hotel-lobby/animate', { previewId, length }),
    onSuccess: onTaskStarted,
    onError: onPaidError,
  });

  const generate = useMutation({
    mutationFn: async () =>
      apiPost<DuetTask>('/api/hotel-lobby/generate', {
        photoA: await toDataUrl(photoA!),
        photoB: await toDataUrl(photoB!),
        size,
        length,
      }),
    onSuccess: (task) => {
      setPreviewId(undefined);
      onTaskStarted(task);
    },
    // Server is the source of truth: out of credits → show the paywall.
    onError: onPaidError,
  });

  const taskQuery = useQuery({
    queryKey: ['hotel-lobby-task', taskId],
    queryFn: () => apiGet<DuetTask>(`/api/hotel-lobby/task?id=${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'failed' ? false : 5000;
    },
  });
  const task = taskQuery.data;
  useEffect(() => {
    if (task?.status === 'success') track('hl_video_ready');
    if (task?.status === 'success' || task?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['hotel-lobby-videos'] });
    }
  }, [task?.status]);
  const priceQuery = useQuery({
    queryKey: ['hotel-lobby-price'],
    queryFn: () =>
      apiGet<{ credits: number; lengths?: Record<DuetLength, number> }>(
        '/api/hotel-lobby/price'
      ),
    staleTime: 10 * 60_000,
  });
  const creditsQuery = useQuery({
    queryKey: ['credits'],
    queryFn: () => apiGet<{ balance: number }>('/api/credits'),
  });
  const { data: permissions } = useUserPermissions(!!user);
  // Price of the selected length (older API responses only had `credits`).
  const price =
    priceQuery.data?.lengths?.[length] ??
    (length === DEFAULT_DUET_LENGTH ? priceQuery.data?.credits : undefined);
  const openPaywall = () => {
    track('hl_paywall_open');
    setPaywall(true);
  };
  // Pre-check so an unpaid user sees the plans before anything is submitted.
  const lacksCredits = () => {
    const balance = creditsQuery.data?.balance;
    return (
      !permissions?.isAdmin &&
      (balance === undefined || price === undefined || balance < price)
    );
  };
  const startGenerate = () => {
    track('hl_generate_click', { signed_in: user ? 1 : 0 });
    // The old checkout can't be reopened once bound to an order; drop it so
    // the paywall prepares a new one. A late payment still renders via cron.
    if (paymentPending) reset();
    // New visitors must choose a paid plan before any generation request is
    // submitted. Existing signed-in users with enough credits can still use
    // their balance directly.
    if (lacksCredits()) return openPaywall();
    generate.mutate();
  };
  const startAnimate = () => {
    track('hl_animate_click', { signed_in: user ? 1 : 0 });
    if (lacksCredits()) return openPaywall();
    animate.mutate();
  };

  const previewReady = preview?.status === 'success' && !taskId;
  const previewRunning = !!previewId && preview?.status === 'pending';
  // An unpaid checkout (the visitor closed the payment page) keeps polling in
  // case payment lands, but must not lock the studio: photos stay editable
  // and Create starts a fresh checkout.
  const paymentPending =
    !!purchaseId &&
    !taskId &&
    ['waiting', 'checkout'].includes(purchaseQuery.data?.status || '');
  const taskRunning =
    generate.isPending ||
    animate.isPending ||
    (!!taskId && task?.status !== 'success' && task?.status !== 'failed');
  const running = previewRunning || taskRunning;
  const paidError = (e: Error | null) =>
    e?.message === INSUFFICIENT_CREDITS ? null : e?.message;
  const blockedNote =
    [generate.error, animate.error].some(
      (e) => e?.message === DIRECTION_BLOCKED
    ) && m['hotel.create.direction_blocked']();
  const error =
    (blockedNote || null) ??
    paidError(generate.error) ??
    paidError(animate.error) ??
    (task?.status === 'failed' ? m['hotel.create.video_failed']() : null) ??
    paidError(taskQuery.error) ??
    null;
  // The inline status line is easy to miss below the button; also toast.
  useEffect(() => {
    if (error) toast.error(`${m['hotel.create.failed']()}: ${error}`);
  }, [error]);
  const reset = () => {
    generate.reset();
    animate.reset();
    forget();
  };
  // A preview/video belongs to the photos and framing it was made from:
  // changing either starts over, so the next click can't animate a stale one.
  const changeInput =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      if (previewId || taskId || purchaseId) reset();
    };
  const credits = price?.toLocaleString('en-US') ?? '…';

  return (
    <div className="rv-page">
      <Header />

      <main>
        {/* Hero and generator in one place: visitors land on the upload. */}
        <section id="create" className="rv-hero">
          <div className="rv-hero-copy">
            <p className="rv-eyebrow">{m['rap.hero.eyebrow']()}</p>
            <h1>{m['rap.hero.title']()}</h1>
            <p className="rv-hero-sub rv-hero-sub-long">
              {m['rap.hero.subtitle']()}
            </p>
            <p className="rv-hero-sub rv-hero-sub-short">
              {m['rap.hero.subtitle_short']()}
            </p>
            <div className="rv-actions">
              <a href="#studio" className="br-btn">
                {m['hotel.hero.cta']()} <ArrowRight size={18} />
              </a>
              <a href="#how" className="br-btn br-btn-ghost">
                {m['rap.hero.secondary']()}
              </a>
            </div>
            <p className="rv-hint rv-hero-note">{m['guest.hero_note']()}</p>
          </div>
          <div id="studio" className="rv-studio">
            <div className="rv-studio-form">
              <div className="rv-upload-grid">
                <PhotoInput
                  label={m['hotel.create.person_a']()}
                  side={m['hotel.create.left']()}
                  file={photoA}
                  onFile={changeInput(setPhotoA)}
                  disabled={running}
                />
                <span className="rv-op" aria-hidden="true">
                  +
                </span>
                <PhotoInput
                  label={m['hotel.create.person_b']()}
                  side={m['hotel.create.right']()}
                  file={photoB}
                  onFile={changeInput(setPhotoB)}
                  disabled={running}
                />
              </div>

              <p className="rv-upload-format">{m['hotel.create.format']()}</p>
              <p className="rv-local-preview-note">{m['studio.free_note']()}</p>
              <div className="rv-studio-submit">
                <div className="rv-actions rv-studio-actions">
                  {task?.status === 'success' || task?.status === 'failed' ? (
                    <button className="br-btn" type="button" onClick={reset}>
                      {m['hotel.create.again']()} <ArrowRight size={17} />
                    </button>
                  ) : previewReady ? (
                    <>
                      <button
                        className={`br-btn ${animate.isPending ? 'br-disabled' : ''}`}
                        type="button"
                        disabled={animate.isPending}
                        onClick={startAnimate}
                      >
                        {animate.isPending && (
                          <Loader2 size={17} className="animate-spin" />
                        )}
                        {m['hotel.create.animate']({ credits })}
                        {!animate.isPending && <ArrowRight size={17} />}
                      </button>
                      <button
                        className="br-btn br-btn-ghost"
                        type="button"
                        onClick={reset}
                      >
                        {m['hotel.create.start_over']()}
                      </button>
                    </>
                  ) : (
                    <button
                      className={`br-btn ${!canGenerate || running ? 'br-disabled' : ''}`}
                      type="button"
                      disabled={!canGenerate || running}
                      onClick={startGenerate}
                    >
                      {running && (
                        <Loader2 size={17} className="animate-spin" />
                      )}
                      {m['hotel.create.generate']()}
                      {!running && <ArrowRight size={17} />}
                    </button>
                  )}
                  {task?.videoUrl && (
                    <>
                      <a
                        className="br-btn br-btn-ghost"
                        href={`/api/hotel-lobby/download?id=${task.id}`}
                        download
                      >
                        {m['hotel.create.download']()} <Download size={17} />
                      </a>
                      <Link className="br-btn br-btn-ghost" href="/videos">
                        {m['hotel.create.my_videos']()}
                      </Link>
                    </>
                  )}
                </div>
                {price !== undefined && !previewReady && (
                  <div className="rv-studio-price">
                    <span>{m['hotel.create.cost']({ credits })}</span>
                    <a href="#pricing">
                      {m['hotel.create.buy_credits']()} <ArrowRight size={12} />
                    </a>
                  </div>
                )}
                {task?.status === 'success' && !task.emailProvided && (
                  <p className="rv-hint rv-download-reminder">
                    {m['guest.download_reminder']()}
                  </p>
                )}
                {purchaseId &&
                  !taskId &&
                  purchaseQuery.data?.status === 'waiting' && (
                    <p className="rv-hint" role="status">
                      {m['guest.payment_pending']()}{' '}
                      <button type="button" onClick={reset}>
                        {m['hotel.create.start_over']()}
                      </button>
                    </p>
                  )}
                <p className="rv-studio-consent">
                  {m['hotel.create.consent']()}
                </p>
                <details className="rv-studio-details">
                  <summary>{m['studio.about_audio']()}</summary>
                  <p>{m['hotel.create.audio_note']()}</p>
                </details>
              </div>
              {(running ||
                error ||
                task?.status === 'success' ||
                task?.status === 'failed' ||
                previewReady) && (
                <p
                  className={`rv-studio-status ${error ? 'rv-studio-status-error' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  {error
                    ? `${m['hotel.create.failed']()}: ${error}`
                    : task?.status === 'success'
                      ? m['hotel.create.done']()
                      : generate.isPending
                        ? m['hotel.create.submitting']()
                        : task?.stage === 'motion'
                          ? `${m['hotel.create.stage_motion']()} ${m['hotel.create.keep_open']()}`
                          : taskId
                            ? `${m['hotel.create.stage_scene']()} ${m['hotel.create.keep_open']()}`
                            : previewReady
                              ? m['hotel.create.preview_ready']({ credits })
                              : previewRunning
                                ? m['hotel.create.submitting']()
                                : photoA && photoB
                                  ? m['hotel.create.ready']()
                                  : m['hotel.create.hint']()}
                </p>
              )}
            </div>
            <aside className="rv-preview">
              <span className="rv-op rv-op-eq" aria-hidden="true">
                =
              </span>
              <div className="rv-preview-heading">
                <h3>
                  {task?.videoUrl || task?.sceneImageUrl || preview?.imageUrl
                    ? m['hotel.create.preview']()
                    : m['rap.create.example_title']()}
                </h3>
              </div>
              <div className="rv-preview-media">
                {task?.videoUrl ? (
                  <video
                    src={task.videoUrl}
                    poster={task.sceneImageUrl ?? undefined}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : task?.sceneImageUrl ? (
                  <img
                    src={task.sceneImageUrl}
                    alt={m['hotel.hero.image_alt']()}
                    width={1024}
                    height={1536}
                  />
                ) : preview?.imageUrl ? (
                  <WatermarkedImage
                    src={preview.imageUrl}
                    alt={m['hotel.hero.image_alt']()}
                    label={m['hotel.create.watermark']()}
                    onError={forget}
                  />
                ) : (
                  // Idle state: the two input photos become this clip.
                  <div className="rv-demo">
                    {/* Poster preloaded in routes/index.tsx: keep in sync. */}
                    <LoopVideo
                      {...demoClip}
                      className="rv-preview-loop"
                      label={m['hotel.hero.image_alt']()}
                      eager
                    />
                    <div className="rv-demo-inputs" aria-hidden="true">
                      <figure>
                        <span className="rv-crop rv-crop-a" />
                        <figcaption>{m['rap.hero.photo_one']()}</figcaption>
                      </figure>
                      <figure>
                        <span className="rv-crop rv-crop-b" />
                        <figcaption>{m['rap.hero.photo_two']()}</figcaption>
                      </figure>
                    </div>
                    <LyricCaption />
                  </div>
                )}
              </div>
              <p className="rv-preview-caption">
                {task?.videoUrl || task?.sceneImageUrl || preview?.imageUrl
                  ? m['studio.result_note']()
                  : m['studio.example_note']()}
              </p>
            </aside>
          </div>
        </section>

        <section className="rv-facts" aria-label={m['rap.facts.label']()}>
          {(
            [
              [m['rap.facts.format.value'], m['rap.facts.format.text']],
              [m['rap.facts.length.value'], m['rap.facts.length.text']],
              [m['rap.facts.time.value'], m['rap.facts.time.text']],
              [m['rap.facts.refund.value'], m['rap.facts.refund.text']],
            ] as const
          ).map(([value, text]) => (
            <div key={value()}>
              <strong>{value()}</strong>
              <span>{text()}</span>
            </div>
          ))}
        </section>

        <Showcase />

        <section id="guide" className="rv-guide">
          <div className="rv-guide-aside">
            <p className="rv-eyebrow">{m['rap.guide.eyebrow']()}</p>
            <h2>{m['rap.guide.title']()}</h2>
            <nav aria-label={m['rap.guide.toc']()}>
              <a href="#what-is">{m['rap.guide.what.title']()}</a>
              <a href="#how-works">{m['rap.guide.works.title']()}</a>
              <a href="#make">{m['rap.guide.make.title']()}</a>
              <a href="#why">{m['rap.guide.why.title']()}</a>
              <a href="#best">{m['rap.guide.best.title']()}</a>
            </nav>
          </div>
          <article className="rv-guide-body">
            <h3 id="what-is">{m['rap.guide.what.title']()}</h3>
            <p>{m['rap.guide.what.one']()}</p>
            <p>{m['rap.guide.what.two']()}</p>
            <h3 id="how-works">{m['rap.guide.works.title']()}</h3>
            <p>{m['rap.guide.works.one']()}</p>
            <p>{m['rap.guide.works.two']()}</p>
            <h3 id="make">{m['rap.guide.make.title']()}</h3>
            <p>{m['rap.guide.make.one']()}</p>
            <h3 id="why">{m['rap.guide.why.title']()}</h3>
            <p>{m['rap.guide.why.one']()}</p>
            <h3 id="best">{m['rap.guide.best.title']()}</h3>
            <p>{m['rap.guide.best.one']()}</p>
            <p className="rv-guide-more">
              {m['rap.guide.more']()}{' '}
              <Link href="/blog/how-to-make-an-ai-rap-video">
                {m['rap.guide.link_make']()}
              </Link>
              {', '}
              <Link href="/blog/best-photos-for-ai-rap-video">
                {m['rap.guide.link_photos']()}
              </Link>
              {m['rap.guide.link_and']()}
              <Link href="/pricing">{m['rap.guide.pricing_link']()}</Link>.
            </p>
          </article>
        </section>

        <section className="rv-features" aria-labelledby="features-heading">
          <div className="rv-head">
            <h2 id="features-heading">{m['rap.features.title']()}</h2>
          </div>
          <div className="rv-bento">
            <article className="rv-cell rv-cell-wide">
              <AudioLines size={22} />
              <h3>{m['rap.features.sync.title']()}</h3>
              <p>{m['rap.features.sync.text']()}</p>
            </article>
            <article className="rv-cell">
              <Users size={22} />
              <h3>{m['rap.features.duo.title']()}</h3>
              <p>{m['rap.features.duo.text']()}</p>
            </article>
            <article className="rv-cell">
              <Smartphone size={22} />
              <h3>{m['rap.features.app.title']()}</h3>
              <p>{m['rap.features.app.text']()}</p>
            </article>
            <article className="rv-cell rv-cell-wide rv-cell-accent">
              <Clapperboard size={22} />
              <h3>{m['rap.features.stage.title']()}</h3>
              <p>{m['rap.features.stage.text']()}</p>
            </article>
            <article className="rv-cell rv-cell-half">
              <RotateCcw size={22} />
              <h3>{m['rap.features.refund.title']()}</h3>
              <p>{m['rap.features.refund.text']()}</p>
            </article>
            <article className="rv-cell rv-cell-half">
              <Lock size={22} />
              <h3>{m['rap.features.privacy.title']()}</h3>
              <p>{m['rap.features.privacy.text']()}</p>
            </article>
          </div>
        </section>

        <section id="how" className="rv-how">
          <div className="rv-head">
            <h2>{m['rap.how.title']()}</h2>
          </div>
          <ol className="rv-timeline">
            <li>
              <Upload size={22} />
              <h3>{m['rap.how.one.title']()}</h3>
              <p>{m['rap.how.one.text']()}</p>
            </li>
            <li>
              <Crop size={22} />
              <h3>{m['rap.how.two.title']()}</h3>
              <p>{m['rap.how.two.text']()}</p>
            </li>
            <li>
              <Clapperboard size={22} />
              <h3>{m['rap.how.three.title']()}</h3>
              <p>{m['rap.how.three.text']()}</p>
            </li>
          </ol>
        </section>

        <section id="ideas" className="rv-ideas">
          <div className="rv-ideas-media">
            {IDEAS.map((idea, index) => (
              <LoopVideo
                key={idea.name}
                src={idea.src}
                poster={idea.poster}
                label={idea.title()}
                className={index === activeIdea ? 'rv-idea-on' : undefined}
              />
            ))}
          </div>
          <div className="rv-ideas-copy">
            <h2>
              <span className="rv-d-only">{m['rap.ideas.title']()}</span>
              <span className="rv-m-only">{m['rap.ideas.title_short']()}</span>
            </h2>
            <p className="rv-ideas-lede">{m['rap.ideas.description']()}</p>
            <ul>
              {IDEAS.map((idea, index) => (
                <li key={idea.name}>
                  <button
                    type="button"
                    aria-pressed={index === activeIdea}
                    onClick={() => setActiveIdea(index)}
                    onMouseEnter={() => setActiveIdea(index)}
                  >
                    <strong>{idea.title()}</strong>
                    <span className="rv-d-only">{idea.text()}</span>
                    <span className="rv-m-only">{idea.short()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rv-tips" aria-labelledby="tips-heading">
          <div className="rv-head">
            <h2 id="tips-heading">{m['rap.tips.title']()}</h2>
          </div>
          <div className="rv-tips-grid">
            <div>
              <h3>
                <Check size={18} /> {m['rap.tips.good.title']()}
              </h3>
              <ul>
                <li>{m['rap.tips.good.one']()}</li>
                <li>{m['rap.tips.good.two']()}</li>
                <li>{m['rap.tips.good.three']()}</li>
                <li>{m['rap.tips.good.four']()}</li>
              </ul>
            </div>
            <div>
              <h3>
                <X size={18} /> {m['rap.tips.bad.title']()}
              </h3>
              <ul>
                <li>{m['rap.tips.bad.one']()}</li>
                <li>{m['rap.tips.bad.two']()}</li>
                <li>{m['rap.tips.bad.three']()}</li>
                <li>{m['rap.tips.bad.four']()}</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="rv-pricing">
          <Pricing
            prepareCheckout={canGenerate ? prepareCheckout : undefined}
          />
        </div>

        {paywallMounted && (
          <Suspense fallback={null}>
            <PaywallDialog
              open={paywall}
              onOpenChange={setPaywall}
              prepareCheckout={prepareCheckout}
            />
          </Suspense>
        )}

        <section id="faq" className="rv-faq" aria-labelledby="faq-heading">
          <div className="rv-head">
            <p className="rv-eyebrow">{m['rap.faq.eyebrow']()}</p>
            <h2 id="faq-heading">{m['rap.faq.title']()}</h2>
          </div>
          <div className="rv-faq-list">
            {/* Static message refs: a template-literal key (m[`…${x}`])
                pulls every message of both locales into the client bundle. */}
            {[
              [
                m['rap.faq.one.question'],
                m['rap.faq.one.answer'],
                m['rap.faq.one.question_short'],
                m['rap.faq.one.answer_short'],
              ],
              [
                m['rap.faq.two.question'],
                m['rap.faq.two.answer'],
                m['rap.faq.two.question_short'],
                m['rap.faq.two.answer_short'],
              ],
              [
                m['rap.faq.three.question'],
                m['rap.faq.three.answer'],
                m['rap.faq.three.question_short'],
                m['rap.faq.three.answer_short'],
              ],
              [
                m['rap.faq.four.question'],
                m['rap.faq.four.answer'],
                m['rap.faq.four.question_short'],
                m['rap.faq.four.answer_short'],
              ],
              [
                m['rap.faq.five.question'],
                m['rap.faq.five.answer'],
                m['rap.faq.five.question_short'],
                m['rap.faq.five.answer_short'],
              ],
              [
                m['rap.faq.six.question'],
                m['rap.faq.six.answer'],
                m['rap.faq.six.question_short'],
                m['rap.faq.six.answer_short'],
              ],
              [
                m['rap.faq.seven.question'],
                m['rap.faq.seven.answer'],
                m['rap.faq.seven.question_short'],
                m['rap.faq.seven.answer_short'],
              ],
              [
                m['rap.faq.eight.question'],
                m['rap.faq.eight.answer'],
                m['rap.faq.eight.question_short'],
                m['rap.faq.eight.answer_short'],
              ],
              [
                m['rap.faq.nine.question'],
                m['rap.faq.nine.answer'],
                m['rap.faq.nine.question_short'],
                m['rap.faq.nine.answer_short'],
              ],
            ].map(([question, answer, questionShort, answerShort], item) => (
              <details key={item}>
                <summary>
                  <span className="rv-d-only">{question()}</span>
                  <span className="rv-m-only">{questionShort()}</span>
                </summary>
                <p>
                  <span className="rv-d-only">{answer()}</span>
                  <span className="rv-m-only">{answerShort()}</span>
                </p>
              </details>
            ))}
          </div>
        </section>

        <Guides />

        <section className="rv-closing">
          <div>
            <h2>{m['rap.bottom.title']()}</h2>
            <p>{m['rap.bottom.text']()}</p>
            <a className="br-btn" href="#create">
              {m['hotel.hero.cta']()} <ArrowRight size={18} />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

/** Karaoke-style burned-in caption: words light up on the beat. */
function LyricCaption() {
  const lines = [m['rap.hero.lyric_one'](), m['rap.hero.lyric_two']()];
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(
      () => setLine((current) => (current + 1) % lines.length),
      3800
    );
    return () => clearInterval(timer);
  }, [lines.length]);
  return (
    <p className="rv-caption" aria-hidden="true" key={line}>
      {lines[line].split(' ').map((word, index) => (
        <span key={index} style={{ animationDelay: `${index * 0.3}s` }}>
          {word}
        </span>
      ))}
    </p>
  );
}
