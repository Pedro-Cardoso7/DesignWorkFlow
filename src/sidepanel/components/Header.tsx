import { useState } from 'react';
import type { Collection } from '../../shared/types';
import { buttonStyle, theme } from '../theme';

interface HeaderProps {
  collections: Collection[];
  activeCollection: Collection | null;
  onSetActive: (id: string) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (name: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  outfitCount: number;
}

export function Header({
  collections,
  activeCollection,
  onSetActive,
  onCreate,
  onRename,
  onDelete,
  outfitCount,
}: HeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const beginRename = () => {
    if (!activeCollection) return;
    setRenameValue(activeCollection.name);
    setRenaming(true);
  };

  const submitRename = async () => {
    await onRename(renameValue);
    setRenaming(false);
  };

  const promptCreate = async () => {
    const name = window.prompt('New collection name');
    if (name && name.trim()) await onCreate(name.trim());
  };

  const confirmDelete = async () => {
    if (!activeCollection) return;
    const ok = window.confirm(
      `Delete "${activeCollection.name}" and its ${outfitCount} outfit${outfitCount === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (ok) await onDelete();
  };

  return (
    <header
      style={{
        padding: 12,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: theme.textMuted }}>
        Active collection
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 13,
              background: theme.input,
              color: theme.text,
              border: `1px solid ${theme.accent}`,
              borderRadius: theme.radius,
              outline: 'none',
            }}
          />
        ) : (
          <select
            value={activeCollection?.id ?? ''}
            onChange={(e) => onSetActive(e.target.value)}
            disabled={collections.length === 0}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 13,
              background: theme.input,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: theme.radius,
            }}
          >
            {collections.length === 0 && <option value="">(no collections)</option>}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <button style={buttonStyle('primary')} onClick={promptCreate} title="New collection">
          +
        </button>
      </div>

      {activeCollection && !renaming && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={buttonStyle('ghost')} onClick={beginRename}>
            Rename
          </button>
          <button style={buttonStyle('danger')} onClick={confirmDelete}>
            Delete
          </button>
        </div>
      )}
    </header>
  );
}
