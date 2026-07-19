import { Header } from './components/Header';
import { OutfitList } from './components/OutfitList';
import { StagingArea } from './components/StagingArea';
import { useAppState } from './hooks/useAppState';
import { theme } from './theme';

export function App() {
  const state = useAppState();

  return (
    <div
      style={{
        fontFamily: theme.fontFamily,
        color: theme.text,
        background: theme.bg,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header
        collections={state.collections}
        activeCollection={state.activeCollection}
        onSetActive={state.setActive}
        onCreate={state.createCollection}
        onRename={state.renameActive}
        onDelete={state.deleteActive}
        outfitCount={state.outfits.length}
      />

      {state.loading ? (
        <div style={{ padding: 12, fontSize: 12, color: theme.textMuted }}>Loading…</div>
      ) : state.activeCollection ? (
        <>
          <StagingArea images={state.staging} />
          <OutfitList outfits={state.outfits} />
        </>
      ) : (
        <div style={{ padding: 12, fontSize: 12, color: theme.textMuted }}>
          Create a collection to get started.
        </div>
      )}
    </div>
  );
}