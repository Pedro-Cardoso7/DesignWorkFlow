import React, { useEffect, useState } from 'react';
import { getAssetsForOutfit, getBlob } from '../../shared/db';
import type { Asset } from '../../shared/types';
import { theme } from '../theme';

interface Props {
  focusedAssetId: string;
  outfitId: string;
  outfitName: string;
  onClose: () => void;
  onOpenOutfit: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function AssetPreviewModal({
  focusedAssetId,
  outfitId,
  outfitName,
  onClose,
  onOpenOutfit,
  onPrev,
  onNext,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeId, setActiveId] = useState(focusedAssetId);

  useEffect(() => {
    setActiveId(focusedAssetId);
  }, [focusedAssetId]);

  useEffect(() => {
    getAssetsForOutfit(outfitId).then(setAssets);
  }, [outfitId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const activeAsset = assets.find((a) => a.id === activeId) ?? assets[0];
  const otherAssets = assets.filter((a) => a.id !== activeAsset?.id);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        gap: 12,
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
          aria-label="Previous asset"
          style={navBtn('left')}
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next asset"
          style={navBtn('right')}
        >
          ›
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          maxWidth: 420,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {outfitName}
        </span>
        <button
          onClick={onOpenOutfit}
          style={{
            flexShrink: 0,
            background: 'transparent',
            color: theme.accent,
            border: `1px solid ${theme.accent}`,
            borderRadius: theme.radius,
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Open outfit →
        </button>
      </div>

      {activeAsset && (
        <AssetImage
          asset={activeAsset}
          style={{
            maxWidth: '90%',
            maxHeight: '55vh',
            objectFit: 'contain',
            borderRadius: theme.radius,
            cursor: 'default',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {otherAssets.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}
        >
          {otherAssets.map((a) => (
            <AssetThumb
              key={a.id}
              asset={a}
              onClick={() => setActiveId(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetImage({
  asset,
  style,
  onClick,
}: {
  asset: Asset;
  style: React.CSSProperties;
  onClick: React.MouseEventHandler;
}) {
  const [url, setUrl] = useState<string | null>(null);

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

  if (!url) return <div style={{ color: theme.textMuted, fontSize: 12 }}>Loading…</div>;
  return <img src={url} alt={asset.name} style={style} onClick={onClick} />;
}

function AssetThumb({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

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
      onClick={onClick}
      title={asset.name}
      style={{
        width: 64,
        height: 64,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        background: theme.input,
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {url && (
        <img
          src={url}
          alt={asset.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  );
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
