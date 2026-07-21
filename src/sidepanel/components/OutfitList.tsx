import { useEffect, useState } from 'react';
import { getAssetsForOutfit, getBlob } from '../../shared/db';
import type { Asset, Outfit } from '../../shared/types';
import { theme } from '../theme';

interface OutfitListProps {
  outfits: Outfit[];
  onOpen: (id: string) => void;
}

export function OutfitList({ outfits, onOpen }: OutfitListProps) {
  return (
    <section style={{ padding: 12 }}>
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
        <span>Outfits</span>
        <span>{outfits.length}</span>
      </div>
      {outfits.length === 0 ? (
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
          Crop a staged image to produce your first outfit.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {outfits.map((outfit) => (
            <OutfitCard key={outfit.id} outfit={outfit} onOpen={() => onOpen(outfit.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OutfitCard({ outfit, onOpen }: { outfit: Outfit; onOpen: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await getAssetsForOutfit(outfit.id);
      if (!cancelled) setAssets(a);
    })();
    return () => {
      cancelled = true;
    };
  }, [outfit.id]);

  return (
    <li
      onClick={onOpen}
      style={{
        padding: 10,
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 500 }}>{outfit.name}</div>
      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
        {outfit.assetIds.length} asset{outfit.assetIds.length === 1 ? '' : 's'}
        {outfit.metadata.prompt ? ` — ${truncate(outfit.metadata.prompt, 60)}` : ''}
      </div>
      {assets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
          {assets.map((a) => (
            <AssetThumb key={a.id} asset={a} />
          ))}
        </div>
      )}
    </li>
  );
}

function AssetThumb({ asset }: { asset: Asset }) {
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
      title={asset.name}
      style={{
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {url && (
        <img
          src={url}
          alt={asset.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}