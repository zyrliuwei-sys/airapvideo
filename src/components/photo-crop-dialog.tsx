import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';

import {
  clamp,
  cropRect,
  initialCrop,
  type CropSettings,
} from '@/lib/image-crop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import '@/styles/photo-crop.css';

export type PhotoCropLabels = {
  title: string;
  description: string;
  frame: string;
  original: string;
  portrait: string;
  square: string;
  zoom: string;
  reset: string;
  cancel: string;
  apply: string;
  error: string;
};

export default function PhotoCropDialog({
  file,
  labels,
  initialSettings,
  onCancel,
  onConfirm,
}: {
  file: File;
  labels: PhotoCropLabels;
  initialSettings?: CropSettings;
  onCancel: () => void;
  onConfirm: (file: File, settings: CropSettings) => void;
}) {
  const [settings, setSettings] = useState(initialSettings ?? initialCrop);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; settings: CropSettings } | null>(
    null
  );
  const zoomId = useId();

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let active = true;
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (active) setError(true);
    };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
      imageRef.current = null;
    };
  }, [file]);

  const rect = dimensions
    ? cropRect(dimensions.width, dimensions.height, settings)
    : undefined;
  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!image || !canvas || !viewport || !dimensions) return;
    const draw = () => {
      const crop = cropRect(dimensions.width, dimensions.height, settings);
      const width =
        viewport.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(width / crop.aspect));
      canvas
        .getContext('2d')
        ?.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [dimensions, settings]);

  async function applyCrop() {
    if (!imageRef.current || !rect || saving) return;
    setSaving(true);
    setError(false);
    try {
      const scale = Math.min(1, 1536 / Math.max(rect.width, rect.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        imageRef.current,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('Image export failed')),
          'image/jpeg',
          0.92
        )
      );
      onConfirm(
        new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-crop.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }),
        settings
      );
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
    >
      <DialogContent className="photo-crop-dialog" showCloseButton={false}>
        <div className="photo-crop-heading">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </div>
        <div
          className="photo-crop-shapes"
          role="group"
          aria-label={labels.frame}
        >
          {(['original', 'portrait', 'square'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              aria-pressed={settings.shape === shape}
              disabled={saving}
              onClick={() => setSettings({ ...initialCrop, shape })}
            >
              {labels[shape]}
            </button>
          ))}
        </div>
        <div className="photo-crop-stage">
          {!dimensions && !error && (
            <Loader2
              className="size-6 animate-spin"
              aria-label={labels.title}
            />
          )}
          {dimensions && (
            <div
              ref={viewportRef}
              className={`photo-crop-viewport${dragging ? 'is-dragging' : ''}`}
              style={{ '--crop-aspect': rect!.aspect } as CSSProperties}
              role="img"
              aria-label={labels.frame}
              tabIndex={0}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.15 : 0.04;
                const deltas: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const delta = deltas[event.key];
                if (!delta || saving) return;
                event.preventDefault();
                setSettings((value) => ({
                  ...value,
                  x: clamp(value.x + delta[0], -1, 1),
                  y: clamp(value.y + delta[1], -1, 1),
                }));
              }}
              onPointerDown={(event) => {
                if (saving || event.button !== 0 || !event.isPrimary) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, settings };
                setDragging(true);
              }}
              onPointerMove={(event) => {
                if (!drag.current || saving) return;
                const start = drag.current;
                const crop = cropRect(
                  dimensions.width,
                  dimensions.height,
                  start.settings
                );
                const scale = event.currentTarget.clientWidth / crop.width;
                const travelX = dimensions.width - crop.width;
                const travelY = dimensions.height - crop.height;
                setSettings({
                  ...start.settings,
                  x:
                    travelX > 0
                      ? clamp(
                          start.settings.x -
                            (2 * (event.clientX - start.x)) / scale / travelX,
                          -1,
                          1
                        )
                      : 0,
                  y:
                    travelY > 0
                      ? clamp(
                          start.settings.y -
                            (2 * (event.clientY - start.y)) / scale / travelY,
                          -1,
                          1
                        )
                      : 0,
                });
              }}
              onPointerUp={() => {
                drag.current = null;
                setDragging(false);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setDragging(false);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(false);
              }}
            >
              <canvas ref={canvasRef} />
              <div className="photo-crop-grid" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="photo-crop-controls">
          <label htmlFor={zoomId}>
            {labels.zoom}
            <span>{Math.round(settings.zoom * 100)}%</span>
          </label>
          <input
            id={zoomId}
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={settings.zoom}
            disabled={!dimensions || saving}
            onChange={(event) =>
              setSettings({ ...settings, zoom: Number(event.target.value) })
            }
          />
          <button
            className="photo-crop-reset"
            type="button"
            disabled={saving}
            onClick={() => setSettings(initialCrop)}
          >
            <RotateCcw size={14} />
            {labels.reset}
          </button>
        </div>
        {error && (
          <p className="photo-crop-error" role="alert">
            {labels.error}
          </p>
        )}
        <div className="photo-crop-actions">
          <button
            type="button"
            className="br-btn br-btn-ghost"
            disabled={saving}
            onClick={onCancel}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            className="br-btn"
            disabled={!dimensions || saving}
            onClick={applyCrop}
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {labels.apply}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
