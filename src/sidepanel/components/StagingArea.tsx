import { useEffect, useState } from 'react';
import { getBlob, removeStagingImage } from '../../shared/db';
import type { ExtensionMessage } from '../../shared/messages';
import type { StagingImage } from '../../shared/types';
import { theme } from '../theme';
import { ImagePreview } from './ImagePreview';

interface StagingAreaProps {
  images: StagingImage[];
  onChanged: () => void | Promise<void>;
}

interface PreviewTarget {
  blobId: string;
  caption: string | null;
}

export function StagingArea({ images, onChanged }: StagingAreaProps) {
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [clearing, setClearing] = useState(false);

  const clearAll = async () => {
    if (images.length === 0) return;
    const ok = window.confirm(
      `Remove all ${images.length} staged image${images.length === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (!ok) return;
    setClearing(true);
    try {
      const collectionId = images[0].collectionId;
      for (const img of images) {
        await removeStagingImage(img.id);
      }
      chrome.runtime
        .sendMessage({ type: 'STAGING_UPDATED', collectionId } satisfies ExtensionMessage)
        .catch(() => {});
      await onChanged();
    } finally {
      setClearing(false);
    }
  };

  return (
    <section style={{ padding: 12, borderBottom: `1px solid ${theme.border}` }}>
      <SectionTitle
        count={images.length}
        action={
          images.length > 0 ? (
            <button
              onClick={clearAll}
              disabled={clearing}
              title="Remove all staged images"
              style={{
                background: 'transparent',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radius,
                padding: '2px 6px',
                fontSize: 10,
                cursor: clearing ? 'not-allowed' : 'pointer',
                textTransform: 'none',
                letterSpacing: 0,
              }}
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          ) : null
        }
      >
        Staging
      </SectionTitle>
      {images.length === 0 ? (
        <Empty>Add images from midjourney.com — they'll queue here until you crop.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {images.map((img) => (
            <StagingThumb
              key={img.id}
              image={img}
              onRemoved={onChanged}
              onPreview={() =>
                setPreview({ blobId: img.blobId, caption: img.metadata.prompt ?? null })
              }
            />
          ))}
        </div>
      )}
      {preview && (
        <ImagePreview
          blobId={preview.blobId}
          caption={preview.caption}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}

function StagingThumb({
  image,
  onRemoved,
  onPreview,
}: {
  image: StagingImage;
  onRemoved: () => void | Promise<void>;
  onPreview: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(image.blobId);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.blobId]);

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await removeStagingImage(image.id);
    chrome.runtime
      .sendMessage({ type: 'STAGING_UPDATED', collectionId: image.collectionId } satisfies ExtensionMessage)
      .catch(() => {});
    await onRemoved();
  };

  const openCrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.runtime
      .sendMessage({ type: 'OPEN_CROP_MODAL', stagingId: image.id } satisfies ExtensionMessage)
      .catch(() => {});
  };

  return (
    <div
      onClick={onPreview}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        cursor: 'zoom-in',
      }}
      title={image.metadata.prompt ?? 'Click to preview'}
    >
      {url && (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {hover && (
        <>
          <button
            onClick={openCrop}
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              right: 4,
              height: 24,
              borderRadius: theme.radius,
              border: 'none',
              background: 'rgba(124,92,255,0.95)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              padding: 0,
            }}
            title="Crop into outfit"
          >
            Crop →
          </button>
          <button
            onClick={remove}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.7)',
              color: theme.text,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: '20px',
              padding: 0,
            }}
            title="Remove from staging"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

function SectionTitle({
  count,
  children,
  action,
}: {
  count: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: theme.textMuted,
        marginBottom: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span>{children}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {action}
        <span>{count}</span>
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: theme.textMuted,
        padding: 12,
        background: theme.panel,
        border: `1px dashed ${theme.border}`,
        borderRadius: theme.radius,
      }}
    >
      {children}
    </div>
  );
}
