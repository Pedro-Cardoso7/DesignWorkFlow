import { useEffect, useRef, useState } from 'react';
import { getAssetsForOutfit, getBlob } from '../../shared/db';
import type { ExtensionMessage } from '../../shared/messages';
import type { Asset, AssetType, Outfit } from '../../shared/types';
import { ASSET_TYPES } from '../../shared/types';
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
  onDeleteAsset: (assetId: string) => Promise<{ asset: Asset; blob: Blob } | null>;
  onRestoreAsset: (asset: Asset, blob: Blob) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onUpdateAssetType: (assetId: string, type: AssetType) => Promise<void>;
  onSendToStaging: () => Promise<void>;
  refreshKey: number;
}

const UNDO_TTL_MS = 6000;

interface UndoState {
  asset: Asset;
  blob: Blob;
  expiresAt: number;
}

export function OutfitDetail({
  outfit,
  onBack,
  onDeleteOutfit,
  onDeleteAsset,
  onRestoreAsset,
  onRename,
  onUpdateAssetType,
  onSendToStaging,
  refreshKey,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(outfit.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingName) setNameDraft(outfit.name);
  }, [outfit.name, editingName]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const commitName = async () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (next && next !== outfit.name) {
      try {
        await onRename(next);
      } catch (err) {
        console.error('[MJDW] rename outfit failed', err);
        setNameDraft(outfit.name);
      }
    } else {
      setNameDraft(outfit.name);
    }
  };

  const cancelName = () => {
    setNameDraft(outfit.name);
    setEditingName(false);
  };

  const [promptCopyStatus, setPromptCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!undoState) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [undoState]);

  useEffect(() => {
    if (undoState && now >= undoState.expiresAt) setUndoState(null);
  }, [now, undoState]);

  const handleDeleteAsset = async (assetId: string) => {
    const removed = await onDeleteAsset(assetId);
    if (removed) {
      setUndoState({ asset: removed.asset, blob: removed.blob, expiresAt: Date.now() + UNDO_TTL_MS });
      setNow(Date.now());
    }
  };

  const handleTypeChange = async (assetId: string, type: AssetType) => {
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, type } : a)));
    try {
      await onUpdateAssetType(assetId, type);
    } catch (err) {
      console.error('[MJDW] update asset type failed', err);
    }
  };

  const handleUndo = async () => {
    if (!undoState) return;
    const snap = undoState;
    setUndoState(null);
    try {
      await onRestoreAsset(snap.asset, snap.blob);
    } catch (err) {
      console.error('[MJDW] restore asset failed', err);
    }
  };

  const copyPrompt = async () => {
    if (!outfit.metadata.prompt) return;
    try {
      await navigator.clipboard.writeText(outfit.metadata.prompt);
      setPromptCopyStatus('copied');
      setTimeout(() => setPromptCopyStatus('idle'), 1500);
    } catch (err) {
      console.error('[MJDW] copy prompt failed', err);
      setPromptCopyStatus('error');
      setTimeout(() => setPromptCopyStatus('idle'), 2000);
    }
  };

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

  const confirmSendToStaging = async () => {
    const ok = window.confirm(
      `Send "${outfit.name}" back to staging? ${assets.length} asset${assets.length === 1 ? '' : 's'} will be discarded (source image kept).`,
    );
    if (ok) await onSendToStaging();
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
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelName();
              }
            }}
            onBlur={commitName}
            style={{
              flex: 1,
              minWidth: 0,
              background: theme.input,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              padding: '4px 8px',
              fontSize: 13,
              fontWeight: 500,
            }}
          />
        ) : (
          <div
            onClick={() => setEditingName(true)}
            title="Click to rename"
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'text',
            }}
          >
            {outfit.name}
          </div>
        )}
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
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontSize: 11,
              color: theme.textMuted,
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'auto',
              padding: '6px 32px 6px 8px',
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
            }}
          >
            {outfit.metadata.prompt}
          </div>
          <button
            onClick={copyPrompt}
            title="Copy prompt to clipboard"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background:
                promptCopyStatus === 'copied'
                  ? '#2a5d2a'
                  : promptCopyStatus === 'error'
                    ? '#5d2a2a'
                    : 'transparent',
              color:
                promptCopyStatus === 'copied' || promptCopyStatus === 'error'
                  ? '#fff'
                  : theme.textMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
              lineHeight: 1.3,
            }}
          >
            {promptCopyStatus === 'copied' ? '✓' : promptCopyStatus === 'error' ? '!' : 'Copy'}
          </button>
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
              onDelete={() => handleDeleteAsset(a.id)}
              onPreview={() => setPreview({ blobId: a.blobId, caption: a.name })}
              onTypeChange={(t) => handleTypeChange(a.id, t)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <button style={buttonStyle('primary')} onClick={addAssets}>
          Add / edit crops
        </button>
        <button
          style={buttonStyle('ghost')}
          onClick={confirmSendToStaging}
          title="Discard this outfit's crops and put the source image back in staging"
        >
          Send to staging
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

      {undoState && (
        <div
          role="alert"
          style={{
            position: 'sticky',
            bottom: 8,
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(30,30,30,0.96)',
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            padding: '8px 10px',
            fontSize: 12,
            color: theme.text,
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ flex: 1 }}>
            Deleted {undoState.asset.name}. ({Math.max(0, Math.ceil((undoState.expiresAt - now) / 1000))}s)
          </span>
          <button
            onClick={handleUndo}
            style={{
              background: 'transparent',
              color: '#7c5cff',
              border: `1px solid #7c5cff`,
              borderRadius: theme.radius,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

function AssetThumb({
  asset,
  onDelete,
  onPreview,
  onTypeChange,
}: {
  asset: Asset;
  onDelete: () => void;
  onPreview: () => void;
  onTypeChange: (type: AssetType) => void;
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
      <select
        value={asset.type}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onTypeChange(e.target.value as AssetType);
        }}
        title="Asset type — controls by-type export folder"
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
          maxWidth: 'calc(100% - 32px)',
          cursor: 'pointer',
        }}
      >
        {ASSET_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
