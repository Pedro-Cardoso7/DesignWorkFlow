import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { getBlob, type AssetWithOutfit } from '../../shared/db';
import { ASSET_TYPES, type AssetType, type Gender } from '../../shared/types';
import { theme } from '../theme';

type GenderFilter = Gender | 'all';
import { AssetPreviewModal } from './AssetPreviewModal';

interface Props {
  assets: AssetWithOutfit[];
  onOpenOutfit: (outfitId: string) => void;
  onUpdateAssetType: (assetId: string, type: AssetType) => Promise<void>;
  collapseSignal?: number;
  expandSignal?: number;
}

export function AssetsByType({ assets, onOpenOutfit, onUpdateAssetType, collapseSignal = 0, expandSignal = 0 }: Props) {
  const [collapsedMap, setCollapsedMap] = useState<Partial<Record<AssetType, boolean>>>({});

  const prevCollapse = useRef(collapseSignal);
  const prevExpand = useRef(expandSignal);

  useEffect(() => {
    if (collapseSignal !== prevCollapse.current) {
      prevCollapse.current = collapseSignal;
      const all: Partial<Record<AssetType, boolean>> = {};
      for (const t of ASSET_TYPES) all[t] = true;
      setCollapsedMap(all);
    }
  }, [collapseSignal]);

  useEffect(() => {
    if (expandSignal !== prevExpand.current) {
      prevExpand.current = expandSignal;
      setCollapsedMap({});
    }
  }, [expandSignal]);

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
            collapsed={collapsedMap[type] ?? false}
            onToggle={() => setCollapsedMap((m) => ({ ...m, [type]: !m[type] }))}
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
  collapsed,
  onToggle,
}: {
  type: AssetType;
  items: AssetWithOutfit[];
  onOpenOutfit: (outfitId: string) => void;
  onUpdateAssetType: (assetId: string, type: AssetType) => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filteredItems = useMemo(() => {
    if (genderFilter === 'all') return items;
    return items.filter((it) => {
      const g = it.asset.gender ?? 'female';
      if (genderFilter === 'female') return g === 'female' || g === 'unisex';
      if (genderFilter === 'male') return g === 'male' || g === 'unisex';
      return g === 'unisex';
    });
  }, [items, genderFilter]);

  const moveFocus = (next: number) => {
    const clamped = Math.max(0, Math.min(filteredItems.length - 1, next));
    setFocusedIdx(clamped);
    itemRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (focusedIdx === null) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(focusedIdx - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(focusedIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(focusedIdx - 3); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(focusedIdx + 3); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewIdx(focusedIdx); }
  };

  const previewItem = previewIdx !== null ? filteredItems[previewIdx] : null;

  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: theme.textMuted,
          marginBottom: collapsed ? 0 : 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, opacity: 0.6 }}>{collapsed ? '▸' : '▾'}</span>
          {type}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['female', 'male', 'all'] as const).map((g) => {
            const label = g === 'female' ? 'F' : g === 'male' ? 'M' : '∅';
            const active = genderFilter === g;
            return (
              <button
                key={g}
                onClick={(e) => { e.stopPropagation(); setGenderFilter(g); }}
                title={g === 'all' ? 'Show all genders' : `Filter: ${g}`}
                style={{
                  background: active ? (g === 'female' ? '#7c3a5a' : g === 'male' ? '#3a5a7c' : theme.panel) : 'transparent',
                  color: active ? '#fff' : theme.textMuted,
                  border: `1px solid ${active ? 'transparent' : theme.border}`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontSize: 9,
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
          <span>{filteredItems.length}{genderFilter !== 'all' ? `/${items.length}` : ''}</span>
        </span>
      </div>
      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }} onKeyDown={handleKeyDown}>
          {filteredItems.map((it, i) => (
            <AssetCard
              key={it.asset.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              item={it}
              onOpen={() => setPreviewIdx(i)}
              onTypeChange={(t) => onUpdateAssetType(it.asset.id, t)}
              isFocused={focusedIdx === i}
              tabIndex={focusedIdx === i || (focusedIdx === null && i === 0) ? 0 : -1}
              onFocus={() => setFocusedIdx(i)}
            />
          ))}
        </div>
      )}
      {previewItem && (
        <AssetPreviewModal
          focusedAssetId={previewItem.asset.id}
          outfitId={previewItem.outfitId}
          outfitName={previewItem.outfitName}
          onClose={() => setPreviewIdx(null)}
          onOpenOutfit={() => { setPreviewIdx(null); onOpenOutfit(previewItem.outfitId); }}
          onPrev={previewIdx! > 0 ? () => setPreviewIdx(previewIdx! - 1) : undefined}
          onNext={previewIdx! < filteredItems.length - 1 ? () => setPreviewIdx(previewIdx! + 1) : undefined}
        />
      )}
    </div>
  );
}

const AssetCard = forwardRef<HTMLDivElement, {
  item: AssetWithOutfit;
  onOpen: () => void;
  onTypeChange: (type: AssetType) => Promise<void>;
  isFocused?: boolean;
  tabIndex?: number;
  onFocus?: () => void;
}>(function AssetCard({ item, onOpen, onTypeChange, isFocused, tabIndex, onFocus }, ref) {
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
      ref={ref}
      onClick={onOpen}
      onFocus={onFocus}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={tabIndex ?? -1}
      title={`${label}\nClick to open outfit`}
      style={{
        aspectRatio: '1 / 1',
        background: theme.input,
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        position: 'relative',
        cursor: 'pointer',
        outline: isFocused ? `2px solid ${theme.accent}` : 'none',
        outlineOffset: 2,
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
});
