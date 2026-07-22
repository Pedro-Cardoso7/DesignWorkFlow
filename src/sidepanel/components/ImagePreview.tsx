import React, { useEffect, useState } from 'react';
import { getBlob } from '../../shared/db';
import { theme } from '../theme';

interface Props {
  blobId: string;
  caption?: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const navBtn = (side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute',
  top: '50%',
  [side]: 12,
  transform: 'translateY(-50%)',
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 22,
  lineHeight: '34px',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export function ImagePreview({ blobId, caption, onClose, onPrev, onNext }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      const blob = await getBlob(blobId);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        cursor: 'zoom-out',
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close preview"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: '26px',
          padding: 0,
        }}
      >
        ×
      </button>
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous image"
          style={navBtn('left')}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next image"
          style={navBtn('right')}
        >
          ›
        </button>
      )}
      {url ? (
        <img
          src={url}
          alt={caption ?? ''}
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: '95%',
            maxHeight: caption ? '80%' : '90%',
            objectFit: 'contain',
            borderRadius: theme.radius,
            cursor: 'default',
          }}
        />
      ) : (
        <div style={{ color: theme.textMuted, fontSize: 12 }}>Loading…</div>
      )}
      {caption && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 12,
            maxWidth: '90%',
            maxHeight: 80,
            overflow: 'auto',
            fontSize: 11,
            color: theme.textMuted,
            lineHeight: 1.4,
            textAlign: 'center',
            cursor: 'default',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
