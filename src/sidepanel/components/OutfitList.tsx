import { useEffect, useMemo, useRef, useState } from 'react';
import { getAssetsForOutfit, getBlob } from '../../shared/db';
import type { Asset, Outfit } from '../../shared/types';
import { theme } from '../theme';

interface OutfitListProps {
  outfits: Outfit[];
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
}

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

const SORT_LABELS: Record<SortKey, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'name-asc': 'Name A→Z',
  'name-desc': 'Name Z→A',
};

export function OutfitList({ outfits, onOpen, onRename }: OutfitListProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? outfits.filter((o) => o.name.toLowerCase().includes(q)) : outfits;
    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'date-desc':
          return b.createdAt - a.createdAt;
        case 'date-asc':
          return a.createdAt - b.createdAt;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
      }
    });
    return sorted;
  }, [outfits, query, sort]);

  useEffect(() => {
    if (focusIndex == null) return;
    if (filtered.length === 0) {
      setFocusIndex(null);
      return;
    }
    if (focusIndex >= filtered.length) setFocusIndex(filtered.length - 1);
  }, [filtered, focusIndex]);

  useEffect(() => {
    const kbdStateRef = { filtered, focusIndex };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (inField && t !== searchRef.current) return;

      if (e.key === 'ArrowDown') {
        if (kbdStateRef.filtered.length === 0) return;
        e.preventDefault();
        const next = kbdStateRef.focusIndex == null ? 0 : Math.min(kbdStateRef.filtered.length - 1, kbdStateRef.focusIndex + 1);
        setFocusIndex(next);
        const id = kbdStateRef.filtered[next]?.id;
        if (id) cardRefs.current[id]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'ArrowUp') {
        if (kbdStateRef.filtered.length === 0) return;
        e.preventDefault();
        const next = kbdStateRef.focusIndex == null ? 0 : Math.max(0, kbdStateRef.focusIndex - 1);
        setFocusIndex(next);
        const id = kbdStateRef.filtered[next]?.id;
        if (id) cardRefs.current[id]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter' && kbdStateRef.focusIndex != null && !inField) {
        const target = kbdStateRef.filtered[kbdStateRef.focusIndex];
        if (target) {
          e.preventDefault();
          onOpen(target.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, focusIndex, onOpen]);

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
        <span>
          {query ? `${filtered.length} / ${outfits.length}` : outfits.length}
        </span>
      </div>

      {outfits.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name (/)"
            style={{
              flex: 1,
              minWidth: 0,
              background: theme.input,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              padding: '4px 8px',
              fontSize: 12,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Clear search"
              style={{
                background: 'transparent',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radius,
                padding: '2px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            title="Sort outfits"
            style={{
              background: theme.input,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              padding: '4px 6px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      )}

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
      ) : filtered.length === 0 ? (
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
          No outfits match "{query}".
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((outfit, i) => (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              focused={i === focusIndex}
              onOpen={() => onOpen(outfit.id)}
              onRename={(name) => onRename(outfit.id, name)}
              cardRef={(el) => {
                cardRefs.current[outfit.id] = el;
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OutfitCard({
  outfit,
  onOpen,
  onRename,
  focused = false,
  cardRef,
}: {
  outfit: Outfit;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  focused?: boolean;
  cardRef?: (el: HTMLLIElement | null) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(outfit.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(outfit.name);
  }, [outfit.name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== outfit.name) {
      try {
        await onRename(next);
      } catch (err) {
        console.error('[MJDW] rename outfit failed', err);
        setDraft(outfit.name);
      }
    } else {
      setDraft(outfit.name);
    }
  };

  const cancel = () => {
    setDraft(outfit.name);
    setEditing(false);
  };

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

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(outfit.sourceImageBlobId);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setSourceUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [outfit.sourceImageBlobId]);

  return (
    <li
      ref={cardRef}
      onClick={editing ? undefined : onOpen}
      style={{
        padding: 10,
        background: theme.panel,
        border: `1px solid ${focused ? '#7c5cff' : theme.border}`,
        boxShadow: focused ? '0 0 0 1px #7c5cff' : undefined,
        borderRadius: theme.radius,
        fontSize: 13,
        cursor: editing ? 'default' : 'pointer',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            background: theme.input,
            borderRadius: theme.radius,
            border: `1px solid ${theme.border}`,
            overflow: 'hidden',
          }}
        >
          {sourceUrl && (
            <img
              src={sourceUrl}
              alt={outfit.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancel();
                  }
                }}
                onBlur={commit}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: theme.input,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: theme.radius,
                  padding: '2px 6px',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                title="Click to rename"
                style={{ fontWeight: 500, cursor: 'text' }}
              >
                {outfit.name}
              </span>
            )}
            {outfit.metadata.lowResolution && <LowResPill />}
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
            {outfit.assetIds.length} asset{outfit.assetIds.length === 1 ? '' : 's'}
            {outfit.metadata.prompt ? ` — ${truncate(outfit.metadata.prompt, 60)}` : ''}
          </div>
        </div>
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

function LowResPill() {
  return (
    <span
      title="Source image is low-resolution — full-res fetch failed at capture time"
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: '#ffb44a',
        background: 'rgba(255,180,74,0.12)',
        border: '1px solid rgba(255,180,74,0.45)',
        borderRadius: 3,
        padding: '1px 5px',
        lineHeight: 1.3,
      }}
    >
      Low-res
    </span>
  );
}