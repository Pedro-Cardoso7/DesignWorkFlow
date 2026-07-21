import { Header } from './components/Header';
import { OutfitList } from './components/OutfitList';
import { OutfitDetail } from './components/OutfitDetail';
import { StagingArea } from './components/StagingArea';
import { ExportBar } from './components/ExportBar';
import { useAppState } from './hooks/useAppState';
import { theme } from './theme';

export function App() {
  const state = useAppState();

  const selectedOutfit =
    state.selectedOutfitId != null
      ? state.outfits.find((o) => o.id === state.selectedOutfitId) ?? null
      : null;

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
        {state.loading ? (
          <div style={{ padding: 12, fontSize: 12, color: theme.textMuted }}>Loading…</div>
        ) : state.activeCollection ? (
          selectedOutfit ? (
            <OutfitDetail
              outfit={selectedOutfit}
              onBack={() => state.selectOutfit(null)}
              onDeleteOutfit={() => state.deleteOutfit(selectedOutfit.id)}
              onDeleteAsset={(assetId) => state.deleteAsset(assetId)}
              refreshKey={state.outfitRefreshKey}
            />
          ) : (
            <>
              <StagingArea images={state.staging} onChanged={state.reload} />
              <OutfitList outfits={state.outfits} onOpen={state.selectOutfit} />
            </>
          )
        ) : (
          <div style={{ padding: 12, fontSize: 12, color: theme.textMuted }}>
            Create a collection to get started.
          </div>
        )}
      </div>

      <ExportBar activeCollectionId={state.activeCollection?.id ?? null} />
    </div>
  );
}
