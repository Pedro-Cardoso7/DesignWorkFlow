import { useEffect, useMemo, useState } from 'react';
import { getBlob, type AssetWithOutfit } from '../../shared/db';
import { ASSET_TYPES, type AssetType } from '../../shared/types';
import { theme } from '../theme';

interface Props {
  assets: AssetWithOutfit[];
  onOpenOutfit: (outfitId: string) => void;
  onUpdateAssetType: (assetId: string, type: AssetType) => Promise<void>;
}

export function AssetsByType({ assets, onOpenOutfit, onUpdateAssetType }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<AssetType, AssetWithOutfit[]>();
    for (const t of ASSET_TYPES) map.set(t, []);
    for (const a of assets) {
      const bucket = map.get(a.asset.type) ?? map.get('other')!;
      bucket.push(a);
    }
    for (const t of ASSET_TYPES) {
      map.get(t)!.sort((a, b) => b.asset.createdAt - a.asset.createdAt);
    }
    return map;
  }, [assets]);

  if (assets.length === 0) {
    return (
      <section style={{ padding: 12 }}>
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
          Crop a staged image to produce your first assets.
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ASSET_TYPES.map((type) => {
        const items = grouped.get(type)!;
        if (items.length === 0) return null;
        return (
          <TypeSection
            key={type}
            type={type}
            items={items}
            onOpenOutfit={onOpenOutfit}
            onUpdateAssetType={onUpdateAssetType}
          />
        );
      })}
    </section>
  );
}

function TypeSection({
  type,
  items,
  onOpenOutfit,
  onUpdateAssetType,
}: {
  type: AssetType;
  items: AssetWithOutfit[];
  onOpenOutfit: (outfitId: string) => void;
  onUpdateAssetType: (assetId: string, type: AssetType) => Promise<void>;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: theme.textMuted,
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{type}</span>
        <span>{items.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {items.map((it) => (
          <AssetCard
            key={it.asset.id}
            item={it}
            onOpen={() => onOpenOutfit(it.outfitId)}
            onTypeChange={(t) => onUpdateAssetType(it.asset.id, t)}
          />
        ))}
      </div>
    </div>
  );
}

function AssetCard({
  item,
  onOpen,
  onTypeChange,
}: {
  item: AssetWithOutfit;
  onOpen: () => void;
  onTypeChange: (type: AssetType) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(item.asset.blobId);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.asset.blobId]);

  const label = `${item.asset.name} — ${item.outfitName}`;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${label}\nClick to open outfit`}
      style={{
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {url && (
        <img
          src={url}
          alt={item.asset.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {hover && (
        <select
          value={item.asset.type}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onTypeChange(e.target.value as AssetType);
          }}
          title="Retag asset type"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            background: 'rgba(0,0,0,0.75)',
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            padding: '1px 3px',
            fontSize: 9,
            maxWidth: 'calc(100% - 8px)',
            cursor: 'pointer',
          }}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)',
          lineHeight: 1.25,
        }}
      >
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: 500,
          }}
        >
          {item.asset.name}
        </div>
        <div
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#c0c0c0',
            fontSize: 8,
          }}
        >
          {item.outfitName}
          {item.outfitLowRes ? ' · low-res' : ''}
        </div>
      </div>
    </div>
  );
}
