import { useEffect, useState } from 'react';
import { getAssetsForOutfit, getBlob } from '../../shared/db';
import type { ExtensionMessage } from '../../shared/messages';
import type { Asset, Outfit } from '../../shared/types';
import { buttonStyle, theme } from '../theme';
import { ImagePreview } from './ImagePreview';

interface PreviewTarget {
  blobId: string;
  caption: string | null;
}

interface Props {
  outfit: Outfit;
  onBack: () => void;
  onDeleteOutfit: () => void | Promise<void>;
  onDeleteAsset: (assetId: string) => void | Promise<void>;
  refreshKey: number;
}

export function OutfitDetail({ outfit, onBack, onDeleteOutfit, onDeleteAsset, refreshKey }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      const [a, blob] = await Promise.all([
        getAssetsForOutfit(outfit.id),
        getBlob(outfit.sourceImageBlobId),
      ]);
      if (cancelled) return;
      setAssets(a);
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setSourceUrl(objectUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [outfit.id, outfit.sourceImageBlobId, refreshKey]);

  const confirmDeleteOutfit = async () => {
    const ok = window.confirm(
      `Delete "${outfit.name}" and its ${assets.length} asset${assets.length === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (ok) await onDeleteOutfit();
  };

  const addAssets = () => {
    chrome.runtime
      .sendMessage({ type: 'OPEN_RECROP_MODAL', outfitId: outfit.id } satisfies ExtensionMessage)
      .catch(() => {});
  };

  return (
    <section style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={buttonStyle('ghost')} onClick={onBack} title="Back to list">
          ← Back
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {outfit.name}
        </div>
      </div>

      {outfit.metadata.lowResolution && (
        <div
          role="status"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: '#ffb44a',
            background: 'rgba(255,180,74,0.10)',
            border: '1px solid rgba(255,180,74,0.35)',
            borderRadius: theme.radius,
            padding: '6px 8px',
          }}
        >
          <strong style={{ fontWeight: 600 }}>Low-resolution source.</strong>{' '}
          Full-res fetch failed at capture time; the source image is the DOM thumbnail. Assets exported from this outfit will be low quality.
        </div>
      )}

      {sourceUrl && (
        <div
          onClick={() =>
            setPreview({
              blobId: outfit.sourceImageBlobId,
              caption: outfit.metadata.prompt ?? null,
            })
          }
          style={{
            background: theme.input,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            overflow: 'hidden',
            cursor: 'zoom-in',
          }}
          title="Click to preview"
        >
          <img
            src={sourceUrl}
            alt={outfit.name}
            style={{ width: '100%', display: 'block' }}
          />
        </div>
      )}

      {outfit.metadata.prompt && (
        <div
          style={{
            fontSize: 11,
            color: theme.textMuted,
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'auto',
            padding: '6px 8px',
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
          }}
        >
          {outfit.metadata.prompt}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: theme.textMuted,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Assets</span>
        <span>{assets.length}</span>
      </div>

      {assets.length === 0 ? (
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
          No assets yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {assets.map((a) => (
            <AssetThumb
              key={a.id}
              asset={a}
              onDelete={() => onDeleteAsset(a.id)}
              onPreview={() => setPreview({ blobId: a.blobId, caption: a.name })}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button style={buttonStyle('primary')} onClick={addAssets}>
          Add / edit crops
        </button>
        <button style={buttonStyle('danger')} onClick={confirmDeleteOutfit}>
          Delete outfit
        </button>
      </div>

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

function AssetThumb({
  asset,
  onDelete,
  onPreview,
}: {
  asset: Asset;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(asset.blobId);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.blobId]);

  return (
    <div
      onClick={onPreview}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${asset.name} — click to preview`}
      style={{
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'zoom-in',
      }}
    >
      {url && (
        <img
          src={url}
          alt={asset.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete asset"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.75)',
            color: theme.text,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '20px',
            padding: 0,
          }}
        >
          ×
        </button>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '2px 4px',
          fontSize: 9,
          color: '#fff',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 100%)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {asset.name}
      </div>
    </div>
  );
}
