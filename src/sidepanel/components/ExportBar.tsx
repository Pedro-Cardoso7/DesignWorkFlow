import { useRef, useState } from 'react';
import { importCollectionZip, type ImportResult } from '../../shared/import';
import { setActiveCollectionId } from '../../shared/db';
import { exportCollectionZip } from '../../shared/zip';
import type { ExportMode } from '../../shared/manifest';
import { buttonStyle, theme } from '../theme';

interface Props {
  activeCollectionId: string | null;
  onImported: () => void | Promise<void>;
}

export function ExportBar({ activeCollectionId, onImported }: Props) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [mode, setMode] = useState<ExportMode>('by-outfit');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportZip = async () => {
    if (!activeCollectionId) return;
    setExporting(true);
    setError(null);
    try {
      await exportCollectionZip(activeCollectionId, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const triggerImport = () => {
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setError(null);
    setImportNote(null);
    try {
      const result: ImportResult = await importCollectionZip(file);
      await setActiveCollectionId(result.collectionId);
      await onImported();
      const warn = result.warnings.length
        ? ` — ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} (see console)`
        : '';
      if (result.warnings.length) console.warn('[MJDW] import warnings:', result.warnings);
      setImportNote(
        `Imported "${result.collectionName}": ${result.outfitsImported} outfit${result.outfitsImported === 1 ? '' : 's'}, ${result.stagingImported} staged${warn}`,
      );
      setTimeout(() => setImportNote(null), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div
          style={{ display: 'flex', gap: 2, border: `1px solid ${theme.border}`, borderRadius: theme.radius, padding: 2 }}
          title="Export layout"
        >
          <ModeButton active={mode === 'by-outfit'} onClick={() => setMode('by-outfit')} label="By outfit" />
          <ModeButton active={mode === 'by-type'} onClick={() => setMode('by-type')} label="By type" />
        </div>
        <button
          style={{ ...buttonStyle('primary'), flex: 1 }}
          onClick={exportZip}
          disabled={!activeCollectionId || exporting}
        >
          {exporting ? 'Zipping…' : 'Export ZIP'}
        </button>
        <button
          style={buttonStyle('ghost')}
          onClick={triggerImport}
          disabled={importing}
          title="Import a ZIP previously created by Export"
        >
          {importing ? 'Importing…' : 'Import ZIP'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </div>
      {importNote && <div style={noteStyle}>{importNote}</div>}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? theme.accent : 'transparent',
        color: active ? '#fff' : theme.textMuted,
        border: 'none',
        borderRadius: theme.radius - 2,
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  borderTop: `1px solid ${theme.border}`,
  background: theme.panel,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: theme.danger,
  padding: '6px 8px',
  background: 'rgba(224,88,88,0.08)',
  border: `1px solid ${theme.danger}`,
  borderRadius: theme.radius,
};

const noteStyle: React.CSSProperties = {
  fontSize: 11,
  color: theme.text,
  padding: '6px 8px',
  background: 'rgba(124,92,255,0.10)',
  border: `1px solid ${theme.accent}`,
  borderRadius: theme.radius,
};
