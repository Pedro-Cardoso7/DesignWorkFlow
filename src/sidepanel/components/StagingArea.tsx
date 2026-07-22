import { forwardRef, useEffect, useRef, useState } from 'react';
import { addStagingImage, createOutfitWithAssets, getBlob, removeStagingImage } from '../../shared/db';
import type { ExtensionMessage } from '../../shared/messages';
import type { MJMetadata, StagingImage } from '../../shared/types';
import { ASSET_TYPES, type AssetType } from '../../shared/types';
import { deriveOutfitNameFromStaging } from '../../shared/naming';
import { theme } from '../theme';
import { ImagePreview } from './ImagePreview';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY_METADATA: MJMetadata = {
  prompt: null,
  mjTimestamp: null,
  mjParams: null,
  jobId: null,
  sourceUrl: null,
  lowResolution: false,
};

interface StagingAreaProps {
  images: StagingImage[];
  onChanged: () => void | Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  collectionId: string;
}

export function StagingArea({ images, onChanged, collapsed, onToggle, collectionId }: StagingAreaProps) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (valid.length === 0) return;
    setUploading(true);
    try {
      for (const file of valid) {
        const name = file.name.replace(/\.[^.]+$/, '');
        const metadata: MJMetadata = { ...EMPTY_METADATA, prompt: name };
        await addStagingImage(collectionId, file, metadata);
      }
      chrome.runtime
        .sendMessage({ type: 'STAGING_UPDATED', collectionId } satisfies ExtensionMessage)
        .catch(() => {});
      await onChanged();
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    await processFiles(e.dataTransfer.files);
  };

  const moveFocus = (next: number) => {
    const clamped = Math.max(0, Math.min(images.length - 1, next));
    setFocusedIdx(clamped);
    itemRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (focusedIdx === null) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(focusedIdx - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(focusedIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(focusedIdx - 3); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(focusedIdx + 3); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chrome.runtime.sendMessage({ type: 'OPEN_CROP_MODAL', stagingId: images[focusedIdx].id }).catch(() => {}); }
  };

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
    <section
      style={{
        padding: 12,
        borderBottom: `1px solid ${theme.border}`,
        background: isDragOver ? 'rgba(124,92,255,0.07)' : undefined,
        outline: isDragOver ? `2px dashed ${theme.accent}` : undefined,
        outlineOffset: -2,
        transition: 'background 0.1s, outline 0.1s',
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
      />
      <SectionTitle
        count={images.length}
        collapsed={collapsed}
        onToggle={onToggle}
        action={
          !collapsed ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                disabled={uploading}
                title="Upload images from desktop"
                style={{
                  background: 'transparent',
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                  borderRadius: theme.radius,
                  padding: '2px 6px',
                  fontSize: 10,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  textTransform: 'none',
                  letterSpacing: 0,
                }}
              >
                {uploading ? 'Uploading…' : '+ Upload'}
              </button>
              {images.length > 0 && (
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
              )}
            </span>
          ) : null
        }
      >
        Staging
      </SectionTitle>
      {!collapsed && (
        <>
          {images.length === 0 ? (
            <Empty>Add images from midjourney.com or drop files here — they'll queue until you crop.</Empty>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }} onKeyDown={handleKeyDown}>
              {images.map((img, i) => (
                <StagingThumb
                  key={img.id}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  image={img}
                  onRemoved={onChanged}
                  onPreview={() => setPreviewIdx(i)}
                  isFocused={focusedIdx === i}
                  tabIndex={focusedIdx === i || (focusedIdx === null && i === 0) ? 0 : -1}
                  onFocus={() => setFocusedIdx(i)}
                />
              ))}
            </div>
          )}
          {previewIdx !== null && images[previewIdx] && (
            <ImagePreview
              blobId={images[previewIdx].blobId}
              caption={images[previewIdx].metadata.prompt ?? null}
              onClose={() => setPreviewIdx(null)}
              onPrev={previewIdx > 0 ? () => setPreviewIdx(previewIdx - 1) : undefined}
              onNext={previewIdx < images.length - 1 ? () => setPreviewIdx(previewIdx + 1) : undefined}
            />
          )}
        </>
      )}
    </section>
  );
}

const StagingThumb = forwardRef<HTMLDivElement, {
  image: StagingImage;
  onRemoved: () => void | Promise<void>;
  onPreview: () => void;
  isFocused?: boolean;
  tabIndex?: number;
  onFocus?: () => void;
}>(function StagingThumb({ image, onRemoved, onPreview, isFocused, tabIndex, onFocus }, ref) {
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

  const [sending, setSending] = useState(false);
  const sendAs = async (type: AssetType) => {
    setSending(true);
    try {
      const blob = await getBlob(image.blobId);
      if (!blob) throw new Error('Source blob missing');
      const dims = await readImageDimensions(blob);
      const name = deriveOutfitNameFromStaging(image);
      const outfit = await createOutfitWithAssets(
        image.collectionId,
        name,
        blob,
        image.metadata,
        [
          {
            name: type,
            crop: { x: 0, y: 0, width: dims.width, height: dims.height },
            blob,
            type,
          },
        ],
      );
      await removeStagingImage(image.id);
      chrome.runtime
        .sendMessage({ type: 'STAGING_UPDATED', collectionId: image.collectionId } satisfies ExtensionMessage)
        .catch(() => {});
      chrome.runtime
        .sendMessage({ type: 'OUTFIT_UPDATED', outfitId: outfit.id } satisfies ExtensionMessage)
        .catch(() => {});
      await onRemoved();
    } catch (err) {
      console.error('[MJDW] send-as failed', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={ref}
      onClick={onPreview}
      onFocus={onFocus}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={tabIndex ?? -1}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        cursor: 'zoom-in',
        outline: isFocused ? `2px solid ${theme.accent}` : 'none',
        outlineOffset: 2,
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
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              right: 4,
              display: 'flex',
              gap: 4,
            }}
          >
            <button
              onClick={openCrop}
              disabled={sending}
              style={{
                flex: 1,
                height: 24,
                borderRadius: theme.radius,
                border: 'none',
                background: 'rgba(124,92,255,0.95)',
                color: '#fff',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                padding: 0,
              }}
              title="Crop into outfit"
            >
              Crop →
            </button>
            <select
              value=""
              disabled={sending}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                const val = e.target.value as AssetType | '';
                if (val) sendAs(val);
                e.target.value = '';
              }}
              title="Send whole image as single asset of chosen type"
              style={{
                flex: 1,
                height: 24,
                borderRadius: theme.radius,
                border: 'none',
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                padding: '0 4px',
              }}
            >
              <option value="" disabled>
                {sending ? 'Sending…' : 'Send as ▾'}
              </option>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
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
});

function SectionTitle({
  count,
  children,
  action,
  collapsed,
  onToggle,
}: {
  count: number;
  children: React.ReactNode;
  action?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: theme.textMuted,
        marginBottom: collapsed ? 0 : 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
        cursor: onToggle ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{collapsed ? '▸' : '▾'}</span>
        {children}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {action}
        <span>{count}</span>
      </span>
    </div>
  );
}

function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      URL.revokeObjectURL(url);
      resolve({ width: naturalWidth, height: naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
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
