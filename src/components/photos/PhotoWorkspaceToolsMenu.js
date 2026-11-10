'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ArrowsLeftRightIcon, ArrowsOutCardinalIcon, CaretDownIcon, ExportIcon, InfoIcon, ListChecksIcon, MapPinAreaIcon, PlusIcon, TrashIcon, WrenchIcon } from '@phosphor-icons/react';
import { usePhotoIconTooltip } from './PhotoIconButton';

// Workspace- and layer-level tools only. Photo-specific actions (Rediger opptaksdata…) stay in the inspector.
// Labels ending in … open a dialog or workflow; labels without it change mode or show information.
export const PHOTO_WORKSPACE_TOOLS = Object.freeze([
  { group: 'Bilder', items: [
    { key: 'add', label: 'Legg til bilder…', icon: PlusIcon },
    { key: 'edit', label: 'Juster plassering og retning', icon: ArrowsOutCardinalIcon, needsPhotos: true },
  ] },
  { group: 'Posisjoner og kilder', items: [
    { key: 'sources', label: 'Koble og posisjoner bilder…', icon: MapPinAreaIcon, needsPhotos: true },
    { key: 'info', label: 'Kilder og koblinger', icon: InfoIcon },
  ] },
  { group: 'Eksport', items: [
    { key: 'complete', label: 'Fullfør opplysninger…', icon: ListChecksIcon, needsPhotos: true },
    { key: 'export', label: 'Eksporter…', icon: ExportIcon, needsPhotos: true },
    // Changes mode only: the choices are used by a later combined GMI + FOTO delivery; nothing is exported here.
    { key: 'delivery', label: 'Velg samlet levering', icon: ArrowsLeftRightIcon, needsPhotos: true },
  ] },
  { group: 'Fjerning', destructive: true, items: [
    { key: 'remove', label: 'Fjern bilder fra laget…', icon: TrashIcon, needsPhotos: true },
  ] },
]);

export default function PhotoWorkspaceToolsMenu({ occurrenceCount, onSelect }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef(null), menuRef = useRef(null);
  usePhotoIconTooltip(triggerRef, 'Verktøy', 'Verktøy');
  const items = () => Array.from(menuRef.current?.querySelectorAll('[role=menuitem]') || []);
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) triggerRef.current?.focus(); };

  useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();
    const outside = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const onMenuKeyDown = (event) => {
    const list = items(), index = list.indexOf(document.activeElement);
    const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
    if (move !== undefined) {
      event.preventDefault();
      list[(move + list.length) % list.length]?.focus();
    } else if (event.key === 'Escape') {
      // Consumed here so the Edit-mode Escape order never sees it.
      event.preventDefault(); event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close(false);
  };

  return <div className="photo-tools-menu">
    {/* Icon-only trigger: the name and tooltip carry «Verktøy»; the chevron shows that it opens a menu. */}
    <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label="Verktøy" data-icon-tooltip="Verktøy"
      className={`photo-tools-trigger gmi-compact-button gmi-focus-ring${open ? ' gmi-selected-control' : ''}`}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
      <WrenchIcon size={18} weight="regular" aria-hidden="true" /><CaretDownIcon size={12} weight="regular" aria-hidden="true" />
    </button>
    {open && <div ref={menuRef} id={menuId} role="menu" aria-label="Verktøy for fotolaget" className="photo-tools-popup gmi-elevated-surface" onKeyDown={onMenuKeyDown}>
      {PHOTO_WORKSPACE_TOOLS.map((group, groupIndex) => <Fragment key={group.group}>
        {groupIndex > 0 && <div role="separator" className={`photo-tools-separator${group.destructive ? ' photo-tools-separator-strong' : ''}`} />}
        <div role="group" aria-label={group.group} className="photo-tools-group">
          {!group.destructive && <p className="photo-tools-group-label" aria-hidden="true">{group.group}</p>}
          {group.items.map(({ key, label, icon: Icon, needsPhotos }) => {
            const unavailable = needsPhotos && !occurrenceCount;
            return <button key={key} type="button" role="menuitem" tabIndex={-1} data-tool={key} aria-disabled={unavailable || undefined}
              className={`photo-tools-item gmi-compact-button gmi-focus-ring${group.destructive ? ' photo-tools-item-destructive' : ''}`}
              onClick={() => {
                if (unavailable) return;
                close(false);
                onSelect?.(key, triggerRef.current);
              }}>
              <Icon size={16} weight="regular" aria-hidden="true" />
              <span><span className="photo-tools-item-label">{label}</span>{unavailable && <span className="photo-tools-item-reason">Laget er tomt</span>}</span>
            </button>;
          })}
        </div>
      </Fragment>)}
    </div>}
  </div>;
}
