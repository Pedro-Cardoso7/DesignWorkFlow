import { useEffect, useRef, useState } from 'react';
import type { ExtensionMessage } from '../shared/messages';
import type { CropRect, MJMetadata, Outfit, StagingImage } from '../shared/types';
import {
  createOutfitWithAssets,
  getAssetsForOutfit,
  getBlob,
  getOutfit,
  getStaging,
  replaceOutfitAssets,
  type CropInput,
} from '../shared/db';

interface Region {
  id: string;
  name: string;
  rect: CropRect;
}

const bg = '#151515';
const panel = '#1e1e1e';
const border = '#2a2a2a';
const text = '#eaeaea';
const muted = '#888';
const accent = '#7c5cff';

type Mode =
  | { kind: 'create'; staging: StagingImage }
  | { kind: 'edit'; outfit: Outfit };

export function App() {
  const params = new URLSearchParams(window.location.search);
  const stagingId = params.get('stagingId');
  const outfitId = params.get('outfitId');

  const [mode, setMode] = useState<Mode | null>(null);
  const [sourceMetadata, setSourceMetadata] = useState<MJMetadata | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [history, setHistory] = useState<Region[][]>([]);
  const [outfitName, setOutfitName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!stagingId && !outfitId) {
      setError('No staging or outfit id provided.');
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      let sourceBlobId: string;
      if (stagingId) {
        const s = await getStaging(stagingId);
        if (!s) {
          if (!cancelled) setError(`Staging entry ${stagingId} not found.`);
          return;
        }
        sourceBlobId = s.blobId;
        setMode({ kind: 'create', staging: s });
        setSourceMetadata(s.metadata);
        setOutfitName(deriveDefaultName(s));
      } else {
        const outfit = await getOutfit(outfitId!);
        if (!outfit) {
          if (!cancelled) setError(`Outfit ${outfitId} not found.`);
          return;
        }
        sourceBlobId = outfit.sourceImageBlobId;
        setMode({ kind: 'edit', outfit });
        setSourceMetadata(outfit.metadata);
        setOutfitName(outfit.name);
        const existing = await getAssetsForOutfit(outfit.id);
        if (!cancelled) {
          setRegions(
            existing.map((a) => ({ id: crypto.randomUUID(), name: a.name, rect: a.crop })),
          );
        }
      }
      const blob = await getBlob(sourceBlobId);
      if (!blob) {
        if (!cancelled) setError('Source image blob missing.');
        return;
      }
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImage(img);
      };
      img.onerror = () => {
        if (!cancelled) setError('Failed to load image.');
      };
      img.src = objectUrl;
      setImageUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [stagingId, outfitId]);

  const pushHistory = (prev: Region[]) => {
    setHistory((h) => [...h, prev]);
  };

  const addRegion = (rect: CropRect) => {
    if (rect.width < 4 || rect.height < 4) return;
    setRegions((prev) => {
      pushHistory(prev);
      return [...prev, { id: crypto.randomUUID(), name: `Region ${prev.length + 1}`, rect }];
    });
  };

  const renameRegion = (id: string, name: string) =>
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));

  const deleteRegion = (id: string) =>
    setRegions((prev) => {
      pushHistory(prev);
      return prev.filter((r) => r.id !== id);
    });

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setRegions(prev);
      return h.slice(0, -1);
    });
  };

  const save = async () => {
    if (!mode || !image || regions.length === 0) return;
    setSaving(true);
    try {
      const crops: CropInput[] = [];
      for (const region of regions) {
        const blob = await cropBlob(image, region.rect);
        crops.push({ name: region.name, crop: region.rect, blob });
      }
      if (mode.kind === 'create') {
        const sourceBlob = await getBlob(mode.staging.blobId);
        if (!sourceBlob) throw new Error('Source blob disappeared');
        await createOutfitWithAssets(
          mode.staging.collectionId,
          outfitName,
          sourceBlob,
          mode.staging.metadata,
          crops,
        );
        chrome.runtime
          .sendMessage({
            type: 'STAGING_UPDATED',
            collectionId: mode.staging.collectionId,
          } satisfies ExtensionMessage)
          .catch(() => {});
      } else {
        await replaceOutfitAssets(mode.outfit.id, crops);
        chrome.runtime
          .sendMessage({
            type: 'OUTFIT_UPDATED',
            outfitId: mode.outfit.id,
          } satisfies ExtensionMessage)
          .catch(() => {});
      }
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const isEdit = mode?.kind === 'edit';
  const saveDisabled = saving || regions.length === 0 || (!isEdit && !outfitName.trim());

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
        <h1 style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>
          {isEdit ? 'Edit outfit crops' : 'Crop into outfit'}
        </h1>
        {isEdit ? (
          <span style={{ fontSize: 13, color: text, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {outfitName}
          </span>
        ) : (
          <input
            value={outfitName}
            onChange={(e) => setOutfitName(e.target.value)}
            placeholder="Outfit name"
            style={{ flex: 1, maxWidth: 320, background: panel, color: text, border: `1px solid ${border}`, borderRadius: 4, padding: '6px 10px', fontSize: 13 }}
          />
        )}
        <span style={{ color: muted, fontSize: 12 }}>
          {regions.length} region{regions.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={undo}
          disabled={history.length === 0}
          style={{
            background: 'transparent',
            color: history.length === 0 ? '#3a3a3a' : muted,
            border: `1px solid ${border}`,
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 13,
            cursor: history.length === 0 ? 'not-allowed' : 'pointer',
          }}
          title="Undo last add/delete"
        >
          Undo
        </button>
        <button
          onClick={save}
          disabled={saveDisabled}
          style={{
            background: saveDisabled ? '#3a3a3a' : accent,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: saveDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save outfit'}
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: 'transparent', color: muted, border: `1px solid ${border}`, borderRadius: 4, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </header>

      {error && (
        <div style={{ padding: 12, background: '#4a1e1e', color: '#ffb0b0', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <main style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          {image ? (
            <CropCanvas image={image} regions={regions} onAdd={addRegion} onDelete={deleteRegion} />
          ) : imageUrl ? (
            <div style={{ color: muted }}>Loading image…</div>
          ) : !error ? (
            <div style={{ color: muted }}>Loading…</div>
          ) : null}
        </main>

        <aside style={{ width: 260, borderLeft: `1px solid ${border}`, padding: 12, overflow: 'auto', background: panel }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: muted, marginBottom: 8 }}>
            Regions
          </div>
          {regions.length === 0 ? (
            <div style={{ fontSize: 12, color: muted, padding: 12, border: `1px dashed ${border}`, borderRadius: 4 }}>
              Click and drag on the image to add a region.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {regions.map((r, i) => (
                <li key={r.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ color: muted, fontSize: 11, width: 16 }}>{i + 1}</span>
                  <input
                    value={r.name}
                    onChange={(e) => renameRegion(r.id, e.target.value)}
                    style={{ flex: 1, background: bg, color: text, border: `1px solid ${border}`, borderRadius: 4, padding: '4px 8px', fontSize: 12 }}
                  />
                  <button
                    onClick={() => deleteRegion(r.id)}
                    style={{ background: 'transparent', color: muted, border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}
                    title="Delete region"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {sourceMetadata?.prompt && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: muted, marginBottom: 4 }}>
                Prompt
              </div>
              <div style={{ fontSize: 11, color: muted, lineHeight: 1.4, maxHeight: 120, overflow: 'auto' }}>
                {sourceMetadata.prompt}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

interface CropCanvasProps {
  image: HTMLImageElement;
  regions: Region[];
  onAdd: (rect: CropRect) => void;
  onDelete: (id: string) => void;
}

function CropCanvas({ image, regions, onAdd, onDelete }: CropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  useEffect(() => {
    const maxW = Math.min(window.innerWidth - 320, 1400);
    const maxH = window.innerHeight - 120;
    const s = Math.min(1, maxW / image.width, maxH / image.height);
    setScale(s);
  }, [image]);

  const dispW = image.width * scale;
  const dispH = image.height * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, dispW, dispH);

    for (const r of regions) {
      const x = r.rect.x * scale;
      const y = r.rect.y * scale;
      const w = r.rect.width * scale;
      const h = r.rect.height * scale;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(124,92,255,0.15)';
      ctx.fillRect(x, y, w, h);
    }

    if (drag) {
      const x = Math.min(drag.startX, drag.curX);
      const y = Math.min(drag.startY, drag.curY);
      const w = Math.abs(drag.curX - drag.startX);
      const h = Math.abs(drag.curY - drag.startY);
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [image, regions, drag, scale, dispW, dispH]);

  const toCanvasCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dispW, e.clientX - rect.left)),
      y: Math.max(0, Math.min(dispH, e.clientY - rect.top)),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = toCanvasCoords(e);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = toCanvasCoords(e);
    setDrag({ ...drag, curX: x, curY: y });
  };
  const onMouseUp = () => {
    if (!drag) return;
    const x0 = Math.min(drag.startX, drag.curX) / scale;
    const y0 = Math.min(drag.startY, drag.curY) / scale;
    const w = Math.abs(drag.curX - drag.startX) / scale;
    const h = Math.abs(drag.curY - drag.startY) / scale;
    setDrag(null);
    onAdd({ x: x0, y: y0, width: w, height: h });
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setDrag(null)}
        style={{ display: 'block', cursor: 'crosshair', border: `1px solid ${border}` }}
      />
      {regions.map((r, i) => (
        <button
          key={r.id}
          onClick={() => onDelete(r.id)}
          title={`Delete ${r.name}`}
          style={{
            position: 'absolute',
            left: r.rect.x * scale + r.rect.width * scale - 22,
            top: r.rect.y * scale + 2,
            width: 20,
            height: 20,
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: '18px',
            padding: 0,
          }}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function deriveDefaultName(s: StagingImage): string {
  if (s.metadata.prompt) {
    const first = s.metadata.prompt.split(/[,.\-\n]/)[0].trim();
    if (first.length >= 3 && first.length <= 40) return first;
  }
  const d = new Date(s.addedAt);
  return `Outfit ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

async function cropBlob(image: HTMLImageElement, rect: CropRect): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png');
  });
}

