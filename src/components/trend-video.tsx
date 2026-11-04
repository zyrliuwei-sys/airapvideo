import { useRef, useState } from 'react';
import { Play } from 'lucide-react';

type TrendVideoProps = {
  src: string;
  poster: string;
  label: string;
  playLabel: string;
  errorLabel: string;
  sourceUrl: string;
  priority?: boolean;
};

/** Click-to-load: a gallery never downloads several MP4s on page load. */
export function TrendVideo({
  src,
  poster,
  label,
  playLabel,
  errorLabel,
  sourceUrl,
  priority,
}: TrendVideoProps) {
  const player = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  function play() {
    const video = player.current;
    if (!video) return;
    video.src = src;
    setLoaded(true);
    void video.play().catch(() => {
      // Native controls remain available when the browser rejects playback.
    });
  }
  return (
    <div className="rd-video">
      {!loaded && (
        <img
          src={poster}
          alt=""
          width={480}
          height={854}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
        />
      )}
      <video
        ref={player}
        className={loaded ? 'rd-video-loaded' : undefined}
        controls={loaded}
        playsInline
        preload="none"
        aria-label={label}
        onError={() => setFailed(true)}
        onPlay={(event) => {
          document
            .querySelectorAll<HTMLVideoElement>('.rd-video video')
            .forEach((video) => {
              if (video !== event.currentTarget) video.pause();
            });
        }}
      />
      {!loaded && (
        <button
          type="button"
          className="rd-video-play"
          onClick={play}
          aria-label={`${playLabel}: ${label}`}
        >
          <Play size={24} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      {failed && (
        <a
          className="rd-video-error"
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {errorLabel}
        </a>
      )}
    </div>
  );
}
