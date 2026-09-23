import { InfoIcon } from '@phosphor-icons/react';
import { CURRENT_APP_VERSION } from '@/data/appReleases.mjs';
import BrandWordmark from './BrandWordmark';

export default function ProductHeader({ onOpenAppInfo, appInfoTriggerRef }) {
  return (
    <header className="relative z-10 h-[76px] flex-none border-b border-gmi-border bg-gmi-surface px-3 py-2">
      <div className="flex h-full min-w-0 items-center justify-between gap-2">
        <BrandWordmark />
        <button
          ref={appInfoTriggerRef}
          type="button"
          onClick={onOpenAppInfo}
          aria-haspopup="dialog"
          aria-label={`Om appen, versjon ${CURRENT_APP_VERSION}`}
          title={`Om appen, versjon ${CURRENT_APP_VERSION}`}
          className="gmi-focus-ring inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg text-gmi-text-subtle hover:bg-gmi-surface-soft hover:text-gmi-navy"
        >
          <InfoIcon size={18} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
