import type { StagingImage } from '../../shared/types';
import { theme } from '../theme';

interface StagingAreaProps {
  images: StagingImage[];
}

export function StagingArea({ images }: StagingAreaProps) {
  return (
    <section style={{ padding: 12, borderBottom: `1px solid ${theme.border}` }}>
      <SectionTitle count={images.length}>Staging</SectionTitle>
      {images.length === 0 ? (
        <Empty>Add images from midjourney.com — they'll queue here until you crop.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {images.map((img) => (
            <div
              key={img.id}
              style={{
                aspectRatio: '1 / 1',
                background: theme.input,
                borderRadius: theme.radius,
                border: `1px solid ${theme.border}`,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionTitle({ count, children }: { count: number; children: React.ReactNode }) {
  return (
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
      <span>{children}</span>
      <span>{count}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}