'use client';

import ValidationV2ErrorBoundary from './validation-v2/ValidationV2ErrorBoundary';
import ValidationV2Workspace from './validation-v2/ValidationV2Workspace';

export default function FieldValidationSidebar({ sidebarWidth, canDockInspector, onDockedInspectorChange, onOpenContact }) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <ValidationV2ErrorBoundary>
        <ValidationV2Workspace
          sidebarWidth={sidebarWidth}
          canDockInspector={canDockInspector}
          onDockedInspectorChange={onDockedInspectorChange}
        />
      </ValidationV2ErrorBoundary>
      <div className="flex flex-none gap-2 border-t border-gmi-border bg-gmi-surface px-2 py-2 text-xs">
        <button type="button" onClick={onOpenContact} aria-haspopup="dialog" className="gmi-compact-button gmi-focus-ring px-2 py-1 font-medium text-gmi-interactive">Kontakt</button>
      </div>
    </div>
  );
}
