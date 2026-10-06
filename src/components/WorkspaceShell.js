import ProductHeader from './ProductHeader';

export default function WorkspaceShell({
  sidebar,
  sidebarWidth,
  onOpenAppInfo,
  appInfoTriggerRef,
  onOpenPhotos,
  primary,
  bottomDock,
  bottomDockOpen,
  photoWorkspace = false,
}) {
  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-gmi-surface-soft${photoWorkspace ? ' photo-workspace-shell' : ''}`}>
      <div className="workspace-left flex h-full flex-none flex-col overflow-hidden" style={{ width: `${sidebarWidth}px` }}>
        <ProductHeader onOpenAppInfo={onOpenAppInfo} appInfoTriggerRef={appInfoTriggerRef} onOpenPhotos={onOpenPhotos} />
        <div className="min-h-0 flex-1">
          {sidebar}
        </div>
      </div>
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section
          className="relative flex min-h-0 min-w-0 overflow-hidden"
          style={bottomDockOpen ? { height: '62%', flex: '0 0 62%' } : { flex: '1 1 0%' }}
          aria-label="Kart og feltinspektør"
        >
          {primary}
        </section>
        {bottomDockOpen && (
          <div className="min-h-0 min-w-0 flex-none" style={{ height: '38%' }}>
            {bottomDock}
          </div>
        )}
      </main>
    </div>
  );
}
