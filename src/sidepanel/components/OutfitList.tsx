import type { Outfit } from '../../shared/types';
import { theme } from '../theme';

interface OutfitListProps {
  outfits: Outfit[];
}

export function OutfitList({ outfits }: OutfitListProps) {
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
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {outfits.map((outfit) => (
            <li
              key={outfit.id}
              style={{
                padding: 10,
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radius,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 500 }}>{outfit.name}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                {outfit.assetIds.length} asset{outfit.assetIds.length === 1 ? '' : 's'}
                {outfit.metadata.prompt ? ` — ${truncate(outfit.metadata.prompt, 60)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}