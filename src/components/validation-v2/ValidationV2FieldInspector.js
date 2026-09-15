'use client';

import { XIcon } from '@phosphor-icons/react';
import { ValidationV2FieldDetailContent } from './ValidationV2FieldDetailContent';
import { VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH } from './fieldDetailLayout';

export default function ValidationV2FieldInspector({
  field,
  rule,
  rules,
  geometryScope,
  layerId,
  dataset,
  result,
  activeTab,
  onTabChange,
  onOpenObjects,
  onClose,
}) {
  return (
    <aside
      role="complementary"
      aria-labelledby="validation-v2-field-inspector-title"
      className="flex h-full min-h-0 flex-none flex-col border-l border-gray-200 bg-white shadow-sm"
      style={{ width: VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH }}
    >
      <header className="flex flex-none items-start justify-between gap-3 border-b border-gray-200 px-3 py-2.5">
        <div className="min-w-0">
          <h2 id="validation-v2-field-inspector-title" aria-live="polite" className="truncate text-sm font-bold text-gray-900">{field.displayName}</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">Feltinformasjon for valgt geometri</p>
        </div>
        <button
          type="button"
          aria-label="Lukk feltinspektør"
          title="Lukk feltinspektør"
          onClick={onClose}
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <XIcon aria-hidden="true" size={18} weight="bold" />
        </button>
      </header>
      <ValidationV2FieldDetailContent
        field={field}
        rule={rule}
        rules={rules}
        geometryScope={geometryScope}
        layerId={layerId}
        dataset={dataset}
        result={result}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onOpenObjects={onOpenObjects}
      />
    </aside>
  );
}
