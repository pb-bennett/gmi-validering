'use client';

import useStore from '@/lib/store';
import { useState, useRef, useEffect } from 'react';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import LayerManager from './LayerManager';

export default function Sidebar({ onAddFile, onAddPhotos, onOpenContact, onOpenPhotoLayer, onAddGmiPhotos, onOpenGemini, hasPhotoLayers, width, onWidthChange }) {
  const layerOrder = useStore((state) => state.layerOrder);
  const multiLayerModeEnabled = useStore(
    (state) => state.ui.multiLayerModeEnabled,
  );
  const isMultiLayerMode =
    multiLayerModeEnabled || layerOrder.length > 0 || hasPhotoLayers;

  // State for sidebar width and resizing
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        onWidthChange(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      // Prevent text selection during resize
      document.body.style.userSelect = 'none';
      document.body.style.WebkitUserSelect = 'none';
      document.body.style.cursor = 'col-resize';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.WebkitUserSelect = '';
      document.body.style.cursor = '';

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  if (!isMultiLayerMode) return null;

  return (
    <div
      ref={sidebarRef}
      style={{
        width: `${width}px`,
        backgroundColor: 'var(--gmi-surface)',
        borderRightColor: 'var(--gmi-border)',
      }}
      className="relative z-[10000] flex h-full flex-shrink-0 flex-col border-r shadow-xl"
    >
      {/* Resize Handle */}
      <div
        className="absolute right-0 -top-[76px] bottom-0 w-1 cursor-col-resize transition-colors z-30"
        style={{
          backgroundColor: 'transparent',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--gmi-interactive)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = 'transparent')
        }
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Content - Scrollable */}
      <div className="min-h-0 flex-1">
        <LayerManager onAddFile={onAddFile} onAddPhotos={onAddPhotos} onOpenPhotoLayer={onOpenPhotoLayer} onAddGmiPhotos={onAddGmiPhotos} onOpenGemini={onOpenGemini} />
      </div>

      <div className="mt-auto border-t border-gmi-border bg-gmi-surface px-4 py-3">
        <button
          type="button"
          onClick={onOpenContact}
          aria-haspopup="dialog"
          className="gmi-compact-button gmi-focus-ring flex min-h-9 w-full items-center justify-center gap-2 px-2.5 py-2 text-sm font-medium"
        >
          <EnvelopeSimpleIcon size={17} weight="regular" aria-hidden="true" />
          Kontakt
        </button>
      </div>
    </div>
  );
}
