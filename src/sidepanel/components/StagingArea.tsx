import { useEffect, useState } from 'react';
import { getBlob, removeStagingImage } from '../../shared/db';
import type { ExtensionMessage } from '../../shared/messages';
import type { StagingImage } from '../../shared/types';
import { theme } from '../theme';

interface StagingAreaProps {
  images: StagingImage[];
  onChanged: () => void | Promise<void>;
}

export function StagingArea({ images, onChanged }: StagingAreaProps) {
  return (
    <section style={{ padding: 12, borderBottom: `1px solid ${theme.border}` }}>
      <SectionTitle count={images.length}>Staging</SectionTitle>
      {images.length === 0 ? (
        <Empty>Add images from midjourney.com — they'll queue here until you crop.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {images.map((img) => (
            <StagingThumb key={img.id} image={img} onRemoved={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function StagingThumb({ image, onRemoved }: { image: StagingImage; onRemoved: () => void | Promise<void> }) {
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

  const remove = async () => {
    await removeStagingImage(image.id);
    chrome.runtime
      .sendMessage({ type: 'STAGING_UPDATED', collectionId: image.collectionId } satisfies ExtensionMessage)
      .catch(() => {});
    await onRemoved();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}
      title={image.metadata.prompt ?? ''}
    >
      {url && (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {hover && (
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
      )}
    </div>
  );
}

function SectionTitle({ count, children }: { count: number; children: React.ReactNode }) {
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
      }}
    >
      <span>{children}</span>
      <span>{count}</span>
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