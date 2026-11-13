'use client';

import { useMemo } from 'react';
import { useLayerFilterDisclosure } from '@/lib/useLayerFilterDisclosure';
import useStore from '@/lib/store';
import { LayerTemaSection, LayerFeltSection } from '@/components/LayerFilterSections';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { gmiProposedViewForStatus, GMI_EDIT_TABLE_VIEWS } from '@/lib/gmiEditView.mjs';

/** Display context only: shared layer actions own the filters in both workspaces. */
export default function GmiLayerFilters({ layerId, layer, status }) {
  'use no memo';
  const [section, setSection] = useLayerFilterDisclosure(layerId, 'section', null);
  const geometry = useStore((state) => state.ui.layerDataTable?.activeTabByLayer?.[layerId] || 'punkter');
  const requestedView = useStore((state) => state.gmiEditTableView[layerId] || GMI_EDIT_TABLE_VIEWS.ORIGINAL);
  const setGeometry = useStore((state) => state.setLayerDataTableTab);
  const resetFilters = useStore((state) => state.resetLayerFilters);
  // Same published status/cache and fallback as LayerDataTable. Counts describe
  // the whole displayed dataset; search, changed-only and selection are separate.
  const proposed = useMemo(() => requestedView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL
    ? gmiProposedViewForStatus(gmiEditSessions, status) : null, [requestedView, status]);
  const proposedBasis = requestedView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL && proposed?.ok;
  const dataset = proposedBasis ? proposed.dataset : layer.data;
  const toggle = (name) => setSection(section === name ? null : name);
  const filtered = Boolean(layer.hiddenCodes?.length || layer.hiddenTypes?.length || layer.feltHiddenValues?.length);

  return <div className="gmi-layer-filters" data-gmi-layer-filters>
    <div className="gmi-filter-basis">
      <p role="status">Filtrert på: <strong>{proposedBasis ? 'Foreslått' : 'Original'}</strong></p>
      <button type="button" className="gmi-edit-link gmi-focus-ring" disabled={!filtered} onClick={() => resetFilters(layerId)}>Nullstill filtre</button>
      <p className="gmi-edit-muted">Antall gjelder hele laget. Tabellens søk, utvalg og «Kun endrede» vises separat.</p>
      {requestedView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL && !proposedBasis && <p role="status" className="gmi-edit-muted">Foreslått er utilgjengelig. Filtrene viser Original, som datatabellen.</p>}
    </div>
    <LayerTemaSection layerId={layerId} layer={layer} dataset={dataset} isOpen={section === 'tema'} onToggle={() => toggle('tema')} />
    <LayerFeltSection layerId={layerId} layer={layer} dataset={dataset} isOpen={section === 'felt'} onToggle={() => toggle('felt')}
      geometryTab={geometry} onGeometryTabChange={(next) => setGeometry(layerId, next)} />
  </div>;
}
