import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  const [aspect, setAspect] = useState<number | null>(null);
  const [useDefaults, setUseDefaults] = useState(true);
  const [saveDefaultsStatus, setSaveDefaultsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const defaultsAppliedRef = useRef(false);
  const canvasRef = useRef<CropCanvasHandle>(null);

  useEffect(() => {
    (async () => {
      const flag = await loadUseDefaultsPref();
      setUseDefaults(flag);
    })();
  }, []);

  useEffect(() => {
    if (!image || !mode || mode.kind !== 'create') return;
    if (defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    (async () => {
      const flag = await loadUseDefaultsPref();
      console.log('[MJDW] useDefaults pref:', flag);
      if (!flag) return;
      const saved = await loadSavedDefaults();
      console.log('[MJDW] loaded saved defaults:', saved);
      const regs = saved
        ? fromSavedDefaults(saved, image.width, image.height)
        : buildDefaultOutfitRegions(image.width, image.height);
      setRegions(regs);
    })();
  }, [image, mode]);

  const toggleUseDefaults = async () => {
    if (!image) return;
    const next = !useDefaults;
    setUseDefaults(next);
    await saveUseDefaultsPref(next);
    pushHistory(regions);
    if (next) {
      const saved = await loadSavedDefaults();
      const regs = saved
        ? fromSavedDefaults(saved, image.width, image.height)
        : buildDefaultOutfitRegions(image.width, image.height);
      setRegions(regs);
    } else {
      setRegions([]);
    }
  };

  const saveAsDefaults = async () => {
    if (!image || regions.length === 0) return;
    setSaveDefaultsStatus('saving');
    try {
      await saveCurrentAsDefaults(regions, image.width, image.height);
      const verify = await loadSavedDefaults();
      console.log('[MJDW] saved defaults, verify readback:', verify);
      if (!verify || verify.length !== regions.length) throw new Error('Readback mismatch');
      setSaveDefaultsStatus('saved');
      setTimeout(() => setSaveDefaultsStatus('idle'), 1500);
    } catch (err) {
      console.error('[MJDW] save defaults failed', err);
      setSaveDefaultsStatus('error');
      setTimeout(() => setSaveDefaultsStatus('idle'), 2500);
    }
  };
  const reloadDefaults = async () => {
    if (!image) return;
    pushHistory(regions);
    const saved = await loadSavedDefaults();
    const regs = saved
      ? fromSavedDefaults(saved, image.width, image.height)
      : buildDefaultOutfitRegions(image.width, image.height);
    setRegions(regs);
  };
  const clearAndReset = async () => {
    if (!image) return;
    await clearSavedDefaults();
    pushHistory(regions);
    setRegions(buildDefaultOutfitRegions(image.width, image.height));
  };

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

  const moveRegionStart = () =>
    setRegions((prev) => {
      pushHistory(prev);
      return prev;
    });

  const moveRegion = (id: string, x: number, y: number) =>
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, rect: { ...r.rect, x, y } } : r)));

  const resizeRegionStart = () =>
    setRegions((prev) => {
      pushHistory(prev);
      return prev;
    });

  const resizeRegion = (id: string, width: number, height: number) =>
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, rect: { ...r.rect, width, height } } : r)));

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

  const kbdRef = useRef({ regions, history, saveDisabled, save, undo, deleteRegion });
  kbdRef.current = { regions, history, saveDisabled, save, undo, deleteRegion };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      if (e.key === 'Escape') {
        if (canvasRef.current?.cancelDrag()) {
          e.preventDefault();
          return;
        }
        if (inField) {
          (t as HTMLElement).blur();
          return;
        }
        e.preventDefault();
        window.close();
        return;
      }

      const s = kbdRef.current;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (inField) return;
        if (s.history.length === 0) return;
        e.preventDefault();
        s.undo();
        return;
      }

      if (e.key === 'Enter') {
        if (s.saveDisabled) return;
        e.preventDefault();
        s.save();
        return;
      }

      if (inField) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (s.regions.length === 0) return;
        e.preventDefault();
        s.deleteRegion(s.regions[s.regions.length - 1].id);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <AspectToggle value={aspect} onChange={setAspect} />
        {!isEdit && (
          <>
            <label
              title="Toggle default Head/Top/Bottom/Shoes regions"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: muted,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={useDefaults}
                onChange={toggleUseDefaults}
                style={{ accentColor: accent, cursor: 'pointer' }}
              />
              Defaults
            </label>
            <button
              onClick={saveAsDefaults}
              disabled={regions.length === 0 || saveDefaultsStatus === 'saving'}
              title="Save current region layout as defaults for next new outfit"
              style={{
                background: saveDefaultsStatus === 'saved' ? '#2a5d2a' : saveDefaultsStatus === 'error' ? '#5d2a2a' : 'transparent',
                color: regions.length === 0 ? '#3a3a3a' : saveDefaultsStatus === 'saved' || saveDefaultsStatus === 'error' ? '#fff' : muted,
                border: `1px solid ${border}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                cursor: regions.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {saveDefaultsStatus === 'saving' ? 'Saving…' : saveDefaultsStatus === 'saved' ? 'Saved ✓' : saveDefaultsStatus === 'error' ? 'Failed' : 'Save as defaults'}
            </button>
            <button
              onClick={reloadDefaults}
              title="Reload saved defaults (or built-in if none saved)"
              style={{
                background: 'transparent',
                color: muted,
                border: `1px solid ${border}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Reload defaults
            </button>
            <button
              onClick={clearAndReset}
              title="Discard saved defaults and restore built-in 1:1 head/top/bottom/shoes"
              style={{
                background: 'transparent',
                color: muted,
                border: `1px solid ${border}`,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Restore built-in
            </button>
          </>
        )}
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
          title="Undo last add/delete (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          onClick={save}
          disabled={saveDisabled}
          title={isEdit ? 'Save changes (Enter)' : 'Save outfit (Enter)'}
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
          title="Cancel (Esc)"
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
            <CropCanvas
              ref={canvasRef}
              image={image}
              regions={regions}
              aspect={aspect}
              onAdd={addRegion}
              onDelete={deleteRegion}
              onMoveStart={moveRegionStart}
              onMove={moveRegion}
              onResizeStart={resizeRegionStart}
              onResize={resizeRegion}
            />
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

const ASPECT_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

function AspectToggle({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, border: `1px solid ${border}`, borderRadius: 4, padding: 2 }} title="Constrain crop aspect ratio">
      {ASPECT_PRESETS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.label}
            onClick={() => onChange(p.value)}
            style={{
              background: active ? accent : 'transparent',
              color: active ? '#fff' : muted,
              border: 'none',
              borderRadius: 3,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

interface CropCanvasProps {
  image: HTMLImageElement;
  regions: Region[];
  aspect: number | null;
  onAdd: (rect: CropRect) => void;
  onDelete: (id: string) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onResizeStart: () => void;
  onResize: (id: string, width: number, height: number) => void;
}

export interface CropCanvasHandle {
  cancelDrag: () => boolean;
}

interface MoveState {
  id: string;
  grabDX: number;
  grabDY: number;
  width: number;
  height: number;
}

interface ResizeState {
  id: string;
  originX: number;
  originY: number;
}

const CropCanvas = forwardRef<CropCanvasHandle, CropCanvasProps>(function CropCanvas(
  { image, regions, aspect, onAdd, onDelete, onMoveStart, onMove, onResizeStart, onResize },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      cancelDrag: () => {
        if (drag) {
          setDrag(null);
          return true;
        }
        return false;
      },
    }),
    [drag],
  );

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

  const constrain = (startX: number, startY: number, curX: number, curY: number) => {
    if (aspect == null) return { curX, curY };
    const dx = curX - startX;
    const dy = curY - startY;
    const signX = dx < 0 ? -1 : 1;
    const signY = dy < 0 ? -1 : 1;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const t = Math.max(0, (ax * aspect + ay) / (aspect * aspect + 1));
    let w = t * aspect;
    let h = t;
    const maxW = signX > 0 ? dispW - startX : startX;
    const maxH = signY > 0 ? dispH - startY : startY;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { curX: startX + signX * w, curY: startY + signY * h };
  };

  const clientToCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(dispW, clientX - rect.left)),
      y: Math.max(0, Math.min(dispH, clientY - rect.top)),
    };
  };

  useEffect(() => {
    if (!resize && !move) return;
    const onWinMove = (e: MouseEvent) => {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      if (resize) {
        const { curX, curY } = constrain(resize.originX, resize.originY, x, y);
        const w = Math.max(4, curX - resize.originX);
        const h = Math.max(4, curY - resize.originY);
        onResize(resize.id, w / scale, h / scale);
      } else if (move) {
        const nxDisp = Math.max(0, Math.min(dispW - move.width, x - move.grabDX));
        const nyDisp = Math.max(0, Math.min(dispH - move.height, y - move.grabDY));
        onMove(move.id, nxDisp / scale, nyDisp / scale);
      }
    };
    const onWinUp = () => {
      setResize(null);
      setMove(null);
    };
    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mouseup', onWinUp);
    return () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mouseup', onWinUp);
    };
  }, [resize, move, scale, dispW, dispH, aspect, onMove, onResize]);

  const hitTest = (x: number, y: number): Region | null => {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      const rx = r.rect.x * scale;
      const ry = r.rect.y * scale;
      const rw = r.rect.width * scale;
      const rh = r.rect.height * scale;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return r;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = toCanvasCoords(e);
    const hit = hitTest(x, y);
    if (hit) {
      onMoveStart();
      setMove({
        id: hit.id,
        grabDX: x - hit.rect.x * scale,
        grabDY: y - hit.rect.y * scale,
        width: hit.rect.width * scale,
        height: hit.rect.height * scale,
      });
      return;
    }
    setDrag({ startX: x, startY: y, curX: x, curY: y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (resize || move) return;
    const { x, y } = toCanvasCoords(e);
    if (drag) {
      const { curX, curY } = constrain(drag.startX, drag.startY, x, y);
      setDrag({ ...drag, curX, curY });
      return;
    }
    const hit = hitTest(x, y);
    setHoverId(hit ? hit.id : null);
  };
  const onMouseUp = () => {
    if (resize || move) return;
    if (!drag) return;
    const x0 = Math.min(drag.startX, drag.curX) / scale;
    const y0 = Math.min(drag.startY, drag.curY) / scale;
    const w = Math.abs(drag.curX - drag.startX) / scale;
    const h = Math.abs(drag.curY - drag.startY) / scale;
    setDrag(null);
    onAdd({ x: x0, y: y0, width: w, height: h });
  };

  const startResize = (r: Region, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart();
    setResize({ id: r.id, originX: r.rect.x * scale, originY: r.rect.y * scale });
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setDrag(null); setHoverId(null); }}
        style={{ display: 'block', cursor: resize ? 'nwse-resize' : move || hoverId ? 'move' : 'crosshair', border: `1px solid ${border}` }}
      />
      {regions.map((r, i) => (
        <div key={r.id}>
          <button
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
          <div
            onMouseDown={(e) => startResize(r, e)}
            title={`Resize ${r.name}`}
            style={{
              position: 'absolute',
              left: r.rect.x * scale + r.rect.width * scale - 8,
              top: r.rect.y * scale + r.rect.height * scale - 8,
              width: 14,
              height: 14,
              background: accent,
              border: '2px solid #fff',
              borderRadius: 2,
              cursor: 'nwse-resize',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
    </div>
  );
});

const DEFAULT_OUTFIT_BANDS: { name: string; sideFactor: number; yFrac: number }[] = [
  { name: 'Head', sideFactor: 0.18, yFrac: 0.02 },
  { name: 'Top', sideFactor: 0.35, yFrac: 0.20 },
  { name: 'Bottom', sideFactor: 0.35, yFrac: 0.50 },
  { name: 'Shoes', sideFactor: 0.18, yFrac: 0.80 },
];

function buildDefaultOutfitRegions(imgW: number, imgH: number): Region[] {
  return DEFAULT_OUTFIT_BANDS.map((b) => {
    const side = Math.min(imgH * b.sideFactor, imgW);
    return {
      id: crypto.randomUUID(),
      name: b.name,
      rect: {
        x: (imgW - side) / 2,
        y: Math.min(imgH * b.yFrac, imgH - side),
        width: side,
        height: side,
      },
    };
  });
}

const CROP_DEFAULTS_KEY = 'mjdw_crop_defaults_v1';

interface SavedDefault {
  name: string;
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
}

async function loadSavedDefaults(): Promise<SavedDefault[] | null> {
  try {
    const res = await chrome.storage.local.get(CROP_DEFAULTS_KEY);
    const val = res[CROP_DEFAULTS_KEY];
    return Array.isArray(val) && val.length > 0 ? (val as SavedDefault[]) : null;
  } catch {
    return null;
  }
}

function fromSavedDefaults(saved: SavedDefault[], imgW: number, imgH: number): Region[] {
  return saved.map((s) => ({
    id: crypto.randomUUID(),
    name: s.name,
    rect: {
      x: Math.max(0, Math.min(imgW, s.xFrac * imgW)),
      y: Math.max(0, Math.min(imgH, s.yFrac * imgH)),
      width: Math.max(1, Math.min(imgW, s.wFrac * imgW)),
      height: Math.max(1, Math.min(imgH, s.hFrac * imgH)),
    },
  }));
}

async function saveCurrentAsDefaults(regions: Region[], imgW: number, imgH: number) {
  const toSave: SavedDefault[] = regions.map((r) => ({
    name: r.name,
    xFrac: r.rect.x / imgW,
    yFrac: r.rect.y / imgH,
    wFrac: r.rect.width / imgW,
    hFrac: r.rect.height / imgH,
  }));
  await chrome.storage.local.set({ [CROP_DEFAULTS_KEY]: toSave });
}

async function clearSavedDefaults() {
  await chrome.storage.local.remove(CROP_DEFAULTS_KEY);
}

const USE_DEFAULTS_KEY = 'mjdw_use_default_crops_v1';

async function loadUseDefaultsPref(): Promise<boolean> {
  try {
    const res = await chrome.storage.local.get(USE_DEFAULTS_KEY);
    const val = res[USE_DEFAULTS_KEY];
    return typeof val === 'boolean' ? val : true;
  } catch {
    return true;
  }
}

async function saveUseDefaultsPref(v: boolean) {
  await chrome.storage.local.set({ [USE_DEFAULTS_KEY]: v });
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

