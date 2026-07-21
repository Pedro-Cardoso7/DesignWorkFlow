import { useState } from 'react';
import { exportCollectionZip } from '../../shared/zip';
import { buttonStyle, theme } from '../theme';

interface Props {
  activeCollectionId: string | null;
}

export function ExportBar({ activeCollectionId }: Props) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportZip = async () => {
    if (!activeCollectionId) return;
    setExporting(true);
    setError(null);
    try {
      await exportCollectionZip(activeCollectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={containerStyle}>
      <button
        style={buttonStyle('primary')}
        onClick={exportZip}
        disabled={!activeCollectionId || exporting}
      >
        {exporting ? 'Zipping…' : 'Export ZIP'}
      </button>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
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
