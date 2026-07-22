import React, { useState } from 'react';
import { AssetsByType } from './components/AssetsByType';
import { ErrorTray } from './components/ErrorTray';
import { Header } from './components/Header';
import { LayoutBanner } from './components/LayoutBanner';
import { OutfitDetail } from './components/OutfitDetail';
import { StagingArea } from './components/StagingArea';
import { ExportBar } from './components/ExportBar';
import { useAppState } from './hooks/useAppState';
import { theme } from './theme';

const controlBtn: React.CSSProperties = {
  background: 'transparent',
  color: theme.textMuted,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  padding: '2px 8px',
  fontSize: 10,
  cursor: 'pointer',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
};

export function App() {
  const state = useAppState();
  const [stagingCollapsed, setStagingCollapsed] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandSignal, setExpandSignal] = useState(0);

  const collapseAll = () => {
    setStagingCollapsed(true);
    setCollapseSignal((n) => n + 1);
  };
  const expandAll = () => {
    setStagingCollapsed(false);
    setExpandSignal((n) => n + 1);
  };

  const selectedOutfit =
    state.selectedOutfitId != null
      ? state.outfits.find((o) => o.id === state.selectedOutfitId) ?? null
      : null;

  const selectedIndex = selectedOutfit
    ? state.outfits.findIndex((o) => o.id === selectedOutfit.id)
    : -1;
  const onPrev = selectedIndex >= 0 && selectedIndex < state.outfits.length - 1
    ? () => state.selectOutfit(state.outfits[selectedIndex + 1].id)
    : null;
  const onNext = selectedIndex > 0
    ? () => state.selectOutfit(state.outfits[selectedIndex - 1].id)
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
      <LayoutBanner />
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
              onPrev={onPrev}
              onNext={onNext}
              onDeleteOutfit={() => state.deleteOutfit(selectedOutfit.id)}
              onDeleteAsset={(assetId) => state.deleteAsset(assetId)}
              onRestoreAsset={(asset, blob) => state.restoreAsset(asset, blob)}
              onRename={(name) => state.renameOutfit(selectedOutfit.id, name)}
              onUpdateAssetType={(id, type) => state.updateAssetType(id, type)}
              onSendToStaging={() => state.sendOutfitToStaging(selectedOutfit.id)}
              refreshKey={state.outfitRefreshKey}
            />
          ) : (
            <>
              <StagingArea
                images={state.staging}
                onChanged={state.reload}
                collapsed={stagingCollapsed}
                onToggle={() => setStagingCollapsed((c) => !c)}
                collectionId={state.activeCollection!.id}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 6,
                  padding: '6px 12px',
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <button onClick={collapseAll} style={controlBtn}>Hide all</button>
                <button onClick={expandAll} style={controlBtn}>Show all</button>
              </div>
              <AssetsByType
                assets={state.assetsFlat}
                onOpenOutfit={state.selectOutfit}
                onUpdateAssetType={state.updateAssetType}
                collapseSignal={collapseSignal}
                expandSignal={expandSignal}
              />
            </>
          )
        ) : (
          <div style={{ padding: 12, fontSize: 12, color: theme.textMuted }}>
            Create a collection to get started.
          </div>
        )}
      </div>

      <ErrorTray />
      <ExportBar
        activeCollectionId={state.activeCollection?.id ?? null}
        onImported={state.reload}
      />
    </div>
  );
}
