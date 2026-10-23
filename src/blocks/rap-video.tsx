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
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import {
  DEFAULT_DUET_LENGTH,
  DUET_LENGTHS,
  type DuetLength,
} from '@/config/hotel-lobby-pricing';
import {
  DEFAULT_DUET_SIZE,
  DUET_SIZES,
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
const heroClip = clip('besties');
const previewClip = clip('cowork');
const coupleClip = clip('couple');
const familyClip = clip('grandpa');
const birthdayClip = clip('bday');

const IDEAS = [
  {
    name: 'couple',
    ...coupleClip,
    title: m['rap.ideas.friends.title'],
    text: m['rap.ideas.friends.text'],
  },
  {
    name: 'family',
    ...familyClip,
    title: m['rap.ideas.battle.title'],
    text: m['rap.ideas.battle.text'],
  },
  {
    name: 'birthday',
    ...birthdayClip,
    title: m['rap.ideas.couples.title'],
    text: m['rap.ideas.couples.text'],
  },
];

/** Muted looping clip that only plays while it is on screen. */
function LoopVideo({
  src,
  poster,
  label,
  className,
  eager,
}: {
  src: string;
  poster: string;
  label?: string;
  className?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
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

// Finished duet clips shown under the hero (muted autoplay loops). Drop MP4s
// into public/videos/examples/ and list them here; the strip hides when empty.
const exampleVideos: { src: string; poster?: string }[] = [];

const INSUFFICIENT_CREDITS = 'Insufficient credits';

type DuetTask = {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  stage: 'scene' | 'motion' | null;
  sceneImageUrl: string | null;
  videoUrl: string | null;
  error: string | null;
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

type Saved = { previewId?: string; taskId?: string; at: number };
const SAVED_KEY = 'hl-duet';
const SAVED_TTL = 3 * 24 * 60 * 60 * 1000;

// Unsent form (photos + options) kept in IndexedDB so it survives the
// sign-in redirect (Google OAuth leaves the site) and reloads. Device-local,
// never uploaded; dropped after a day.
type Draft = {
  photoA: File | null;
  photoB: File | null;
  direction: string;
  size: DuetSize;
  length: DuetLength;
  consent: boolean;
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

// Preview the visitor asked to animate before being sent to sign up.
const RESUME_KEY = 'hl-resume-animate';

function resumeAnimate(previewId?: string) {
  try {
    if (previewId) {
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ previewId, at: Date.now() })
      );
    }
  } catch {}
}

/** The pending preview id (if fresh), cleared so it only resumes once. */
function takeResumeAnimate(): string | undefined {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return undefined;
    localStorage.removeItem(RESUME_KEY);
    const { previewId, at } = JSON.parse(raw);
    return Date.now() - at < 60 * 60 * 1000 ? previewId : undefined;
  } catch {
    return undefined;
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

// Downscale to ≤1536px JPEG so uploads stay small; fal accepts data URIs.
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
}: {
  label: string;
  side: string;
  file: File | null;
  onFile: (file: File | null) => void;
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
    <label className="rv-upload">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (file && file.size > 10 * 1024 * 1024) {
            alert(m['hotel.upload_limit']());
            e.target.value = '';
            return;
          }
          if (file) track('hl_photo_upload');
          onFile(file);
        }}
      />
      {preview ? (
        <img src={preview} alt={label} className="rv-upload-preview" />
      ) : (
        <Upload size={24} strokeWidth={1.5} />
      )}
      <span>{label}</span>
      <small>{side}</small>
    </label>
  );
}

export function RapVideoPage() {
  const [photoA, setPhotoA] = useState<File | null>(null);
  const [photoB, setPhotoB] = useState<File | null>(null);
  const [direction, setDirection] = useState('');
  const [size, setSize] = useState<DuetSize>(DEFAULT_DUET_SIZE);
  const [length, setLength] = useState<DuetLength>(DEFAULT_DUET_LENGTH);
  const [previewId, setPreviewId] = useState<string>();
  const [taskId, setTaskId] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [activeIdea, setActiveIdea] = useState(0);
  const { data: session } = useSession();
  const user = session?.user;
  const canGenerate = consent && !!photoA && !!photoB;
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
        setDirection(d.direction);
        if (OFFERED_DUET_SIZES.includes(d.size)) setSize(d.size);
        if (d.length in DUET_LENGTHS) setLength(d.length);
        setConsent(d.consent);
      }
      setDraftReady(true);
    });
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    if (!photoA && !photoB && !direction.trim()) {
      draftDelete(DRAFT_KEY);
      return;
    }
    draftSet(DRAFT_KEY, {
      photoA,
      photoB,
      direction,
      size,
      length,
      consent,
      at: Date.now(),
    } satisfies Draft);
  }, [draftReady, photoA, photoB, direction, size, length, consent]);
  // Only ever written here; cleared explicitly by `forget` so a (re)mount
  // with empty state can't wipe what the restore above is about to read.
  useEffect(() => {
    if (previewId || taskId) saveState({ previewId, taskId, at: Date.now() });
  }, [previewId, taskId]);
  const forget = () => {
    saveState(null);
    setTaskId(undefined);
    setPreviewId(undefined);
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
        direction: direction.trim() || undefined,
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
    enabled: !!taskId && !!user,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'failed' ? false : 5000;
    },
  });
  const task = taskQuery.data;
  useEffect(() => {
    if (task?.status === 'success') track('hl_video_ready');
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
    enabled: !!user,
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
      balance !== undefined &&
      price !== undefined &&
      balance < price
    );
  };
  const startGenerate = () => {
    track('hl_generate_click', { signed_in: user ? 1 : 0 });
    // New visitors must choose a paid plan before any generation request is
    // submitted. Existing signed-in users with enough credits can still use
    // their balance directly.
    if (!user || lacksCredits()) return openPaywall();
    generate.mutate();
  };
  const startAnimate = () => {
    track('hl_animate_click', { signed_in: user ? 1 : 0 });
    if (!user) {
      track('hl_sign_in_prompt');
      resumeAnimate(previewId);
      window.location.href = localizeHref(
        `/sign-up?callbackUrl=${encodeURIComponent('/#create')}`
      );
      return;
    }
    if (lacksCredits()) return openPaywall();
    animate.mutate();
  };

  const previewReady = preview?.status === 'success' && !taskId;
  // Back from sign-up with the preview they wanted animated: carry on (or show
  // the plans) without making them find and click the button again.
  useEffect(() => {
    if (
      user &&
      previewReady &&
      price !== undefined &&
      creditsQuery.data !== undefined &&
      takeResumeAnimate() === previewId
    ) {
      startAnimate();
    }
  }, [user, previewReady, price, creditsQuery.data, previewId]);
  const previewRunning = !!previewId && preview?.status === 'pending';
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
      if (previewId || taskId) reset();
    };
  const credits = price?.toLocaleString('en-US') ?? '…';

  return (
    <div className="rv-page">
      <Header />

      <main>
        <section className="rv-hero">
          <div className="rv-hero-copy">
            <p className="rv-eyebrow">{m['rap.hero.eyebrow']()}</p>
            <h1>{m['rap.hero.title']()}</h1>
            <p className="rv-hero-sub">{m['rap.hero.subtitle']()}</p>
            <div className="rv-actions">
              <a href="#create" className="br-btn">
                {m['hotel.hero.cta']()} <ArrowRight size={18} />
              </a>
              <a href="#how" className="br-btn br-btn-ghost">
                {m['rap.hero.secondary']()}
              </a>
            </div>
          </div>
          <div className="rv-hero-stage">
            <div className="rv-inputs" aria-hidden="true">
              <figure>
                <span className="rv-crop rv-crop-a" />
                <figcaption>{m['rap.hero.photo_one']()}</figcaption>
              </figure>
              <figure>
                <span className="rv-crop rv-crop-b" />
                <figcaption>{m['rap.hero.photo_two']()}</figcaption>
              </figure>
            </div>
            <div className="rv-frame">
              {/* Poster preloaded in routes/index.tsx: keep in sync. */}
              <LoopVideo
                {...heroClip}
                label={m['hotel.hero.image_alt']()}
                eager
              />
              <LyricCaption />
            </div>
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

        {exampleVideos.length > 0 && (
          <section className="rv-examples">
            {exampleVideos.map((video) => (
              <video
                key={video.src}
                src={video.src}
                poster={video.poster}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ))}
          </section>
        )}

        <section id="create" className="rv-create">
          <div className="rv-head">
            <h2>{m['hotel.create.title']()}</h2>
            <p>{m['hotel.create.description']()}</p>
          </div>
          <div className="rv-studio">
            <div className="rv-studio-form">
              <div className="rv-step">
                <h3>{m['hotel.create.photos']()}</h3>
                <p>{m['hotel.create.format']()}</p>
              </div>
              <div className="rv-upload-grid">
                <PhotoInput
                  label={m['hotel.create.person_a']()}
                  side={m['hotel.create.left']()}
                  file={photoA}
                  onFile={changeInput(setPhotoA)}
                />
                <PhotoInput
                  label={m['hotel.create.person_b']()}
                  side={m['hotel.create.right']()}
                  file={photoB}
                  onFile={changeInput(setPhotoB)}
                />
              </div>

              <div className="rv-step">
                <h3>{m['rap.create.step_shot']()}</h3>
                <p>{m['rap.create.step_shot_hint']()}</p>
              </div>
              <div className="rv-option-groups">
                <div>
                  <p className="rv-field-label" id="duet-size-label">
                    {m['hotel.create.size']()}
                  </p>
                  <div
                    className="rv-options"
                    role="radiogroup"
                    aria-labelledby="duet-size-label"
                  >
                    {OFFERED_DUET_SIZES.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={size === key}
                        className="rv-option"
                        disabled={running}
                        onClick={() =>
                          key !== size && changeInput(setSize)(key)
                        }
                      >
                        <span
                          className="rv-option-shape"
                          style={{
                            aspectRatio: `${DUET_SIZES[key].width} / ${DUET_SIZES[key].height}`,
                          }}
                        />
                        <span>
                          {key === 'full'
                            ? m['hotel.create.shot_full']()
                            : m['hotel.create.shot_classic']()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="rv-field-label" id="duet-length-label">
                    {m['hotel.create.length']()}
                  </p>
                  <div
                    className="rv-options"
                    role="radiogroup"
                    aria-labelledby="duet-length-label"
                  >
                    {(Object.keys(DUET_LENGTHS) as DuetLength[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={length === key}
                        className="rv-option"
                        disabled={running}
                        onClick={() => setLength(key)}
                      >
                        <span className="rv-option-seconds">
                          {m['hotel.create.length_seconds']({ seconds: key })}
                        </span>
                        <span>
                          {priceQuery.data?.lengths?.[key]?.toLocaleString(
                            'en-US'
                          ) ?? '…'}{' '}
                          {m['hotel.create.length_credits']()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rv-step">
                <h3>
                  <label htmlFor="direction">
                    {m['hotel.create.direction']()}
                  </label>
                </h3>
                <p>{m['rap.create.step_note_hint']()}</p>
              </div>
              <textarea
                id="direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                maxLength={400}
                placeholder={m['hotel.create.placeholder']()}
              />
              <label className="rv-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{m['hotel.create.consent']()}</span>
              </label>
              <div className="rv-actions">
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
                      {user
                        ? m['hotel.create.animate']({ credits })
                        : m['hotel.create.animate_sign_in']()}
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
                    {running && <Loader2 size={17} className="animate-spin" />}
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
                    <Link
                      className="br-btn br-btn-ghost"
                      href="/settings/videos"
                    >
                      {m['hotel.create.my_videos']()}
                    </Link>
                  </>
                )}
              </div>
              {price !== undefined && !previewReady && (
                <p className="rv-hint">
                  {m['hotel.create.cost']({ credits })}{' '}
                  <a href="#pricing">{m['hotel.create.buy_credits']()}</a>
                </p>
              )}
              <p className="rv-hint" role="status" aria-live="polite">
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
            </div>
            <aside className="rv-preview">
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
                  <LoopVideo
                    {...previewClip}
                    className="rv-preview-loop"
                    label={m['rap.features.sync.alt']()}
                  />
                )}
              </div>
              {task?.videoUrl || task?.sceneImageUrl || preview?.imageUrl ? (
                <>
                  <p className="rv-preview-title">
                    {m['hotel.create.preview']()}
                  </p>
                  <p>{m['hotel.create.preview_note']()}</p>
                </>
              ) : (
                <>
                  <p className="rv-preview-title">
                    {m['rap.create.example_title']()}
                  </p>
                  <p>{m['rap.create.example_note']()}</p>
                </>
              )}
            </aside>
          </div>
        </section>

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
            <h2>{m['rap.ideas.title']()}</h2>
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
                    <span>{idea.text()}</span>
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
          <Pricing />
        </div>

        {paywallMounted && (
          <Suspense fallback={null}>
            <PaywallDialog open={paywall} onOpenChange={setPaywall} />
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
              [m['rap.faq.one.question'], m['rap.faq.one.answer']],
              [m['rap.faq.two.question'], m['rap.faq.two.answer']],
              [m['rap.faq.three.question'], m['rap.faq.three.answer']],
              [m['rap.faq.four.question'], m['rap.faq.four.answer']],
              [m['rap.faq.five.question'], m['rap.faq.five.answer']],
              [m['rap.faq.six.question'], m['rap.faq.six.answer']],
              [m['rap.faq.seven.question'], m['rap.faq.seven.answer']],
              [m['rap.faq.eight.question'], m['rap.faq.eight.answer']],
              [m['rap.faq.nine.question'], m['rap.faq.nine.answer']],
            ].map(([question, answer], item) => (
              <details key={item}>
                <summary>{question()}</summary>
                <p>{answer()}</p>
              </details>
            ))}
          </div>
        </section>

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
