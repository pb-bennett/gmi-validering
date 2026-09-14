export default function WorkspaceShell({
  sidebar,
  sidebarWidth,
  primary,
  bottomDock,
  bottomDockOpen,
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <div className="h-full flex-none overflow-hidden" style={{ width: `${sidebarWidth}px` }}>
        {sidebar}
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
