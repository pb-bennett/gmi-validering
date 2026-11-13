'use client';

import { startTransition, useCallback, useState, useEffect, useEffectEvent, useMemo, useRef, useReducer } from 'react';
import dynamic from 'next/dynamic';
import { EnvelopeSimpleIcon, ImagesIcon, InfoIcon, GearSixIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import FileUpload from '@/components/FileUpload';
import GlobalFileDrop from '@/components/GlobalFileDrop';
import PhotoImportWizard from '@/components/photos/PhotoImportWizard';
import usePhotoSession from '@/components/photos/usePhotoSession';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { loadedGmiSources } from '@/lib/photos/loadedGmiSource.mjs';
import { emptyPhotoWorkspace, photoWorkspaceReducer } from '@/lib/photos/photoWorkspaceState.mjs';
import { photoWorkspaceView } from '@/lib/photos/photoWorkspaceView.mjs';
import { canRedoPhotoEdit, canUndoPhotoEdit, changedPhotoIds, effectivePhoto, emptyPhotoEditState, photoEditChanges, photoEditIsActive,
  photoEditReducer } from '@/lib/photos/photoEditSession.mjs';
import { isPhotoPosition } from '@/lib/photos/photoSpatial.mjs';
import { photoStackMembers } from '@/lib/photos/photoStacks.mjs';
import { photoExportConfigFor, reconcilePhotoExportConfig, updatePhotoExportConfig } from '@/lib/photos/photoExportConfig.mjs';
import { createPhotoExportFlow, photoExportFlowFilter, photoExportFlowIsLive, photoExportFlowProgress } from '@/lib/photos/photoExportFlow.mjs';
import { ignoreFollowUpClick } from '@/components/photos/photoFollowUpClick';
import PhotoWorkspaceCollection from '@/components/photos/PhotoWorkspaceCollection';
import PhotoPositioningWizard from '@/components/photos/PhotoPositioningWizard';
import PhotoWorkspaceInspector from '@/components/photos/PhotoWorkspaceInspector';
import PhotoWorkspaceViewer from '@/components/photos/PhotoWorkspaceViewer';
import PhotoCaptureMetadataDialog from '@/components/photos/PhotoCaptureMetadataDialog';
import PhotoSourcesInfoDialog from '@/components/photos/PhotoSourcesInfoDialog';
import PhotoExportWizard from '@/components/photos/PhotoExportWizard';
import PhotoCompletionDialog from '@/components/photos/PhotoCompletionDialog';
import PhotoWorkspaceToast from '@/components/photos/PhotoWorkspaceToast';
import PhotoEditCommandBar from '@/components/photos/PhotoEditCommandBar';
import PhotoEditBoundaryDialog from '@/components/photos/PhotoEditBoundaryDialog';
import usePhotoMapDisplayPreference from '@/components/photos/usePhotoMapDisplayPreference';
import DataDisplayModal from '@/components/DataDisplayModal';
import ZValidationModal from '@/components/ZValidationModal';
import InclineAnalysisModal from '@/components/InclineAnalysisModal';
import FieldValidationSidebar from '@/components/FieldValidationSidebar';
import GmiEditWorkspace, { GMI_EDIT_INSPECTOR_ROOT_ID } from '@/components/gmi-edit/GmiEditWorkspace';
import GmiConfirmDialog, { UnsavedGmiLayers } from '@/components/gmi-edit/GmiConfirmDialog';
import { gmiEditRemovalBlock } from '@/lib/gmiEditSessions.mjs';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import LayerDataTable from '@/components/LayerDataTable';
import MapPaneToolbar from '@/components/MapPaneToolbar';
import { MapPanePresentationProvider } from '@/components/MapPanePresentationProvider';
import TerrainFetcher from '@/components/TerrainFetcher';
import WmsLayerModal from '@/components/WmsLayerModal';
import GeminiConnectionButton from '@/components/gemini-wfs/GeminiConnectionButton';
import GeminiConnectionModal from '@/components/gemini-wfs/GeminiConnectionModal';
import ShareQrModal from '@/components/ShareQrModal';
import StatsModal from '@/components/StatsModal';
import AppInfoModal from '@/components/AppInfoModal';
import { TestModeActivation } from '@/components/TestModeControl';
import { CURRENT_APP_VERSION, LATEST_ANNOUNCED_RELEASE } from '@/data/appReleases.mjs';
import { decideAutomaticAppInfo } from '@/lib/appInfoState.mjs';
import WorkspaceShell from '@/components/WorkspaceShell';
import BrandWordmark from '@/components/BrandWordmark';
import { VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM } from '@/components/validation-v2/fieldDetailLayout';
import { getTerrainStats } from '@/lib/analysis/terrain';
import TestModeControl from '@/components/TestModeControl';
import useStore from '@/lib/store';

const DEV_RUNTIME_SNAPSHOTS_KEY = 'gmi:dev:runtime:snapshots';
const DEV_RUNTIME_EVENTS_KEY = 'gmi:dev:runtime:events';
const DEV_RUNTIME_MAX_ITEMS = 120;
const PUBLIC_REPO_URL =
  'https://github.com/pb-bennett/gmi-validering';

function appendDevRuntimeItem(key, item) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list)
      ? [...list.slice(-(DEV_RUNTIME_MAX_ITEMS - 1)), item]
      : [item];
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage failures in diagnostics path
  }
}

// Dynamic import for 3D viewer to prevent SSR issues with Three.js
const Viewer3D = dynamic(() => import('@/components/3D/Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gmi-text-subtle">
      Loading 3D...
    </div>
  ),
});

export default function Home() {
  const { photoLayers, sourceReviews } = usePhotoSession();
  const hasPhotoLayers = photoLayers.length > 0;
  const hasSurveyData = useStore((state) => Boolean(state.data) || state.layerOrder.length > 0);
  const parsingStatus = useStore((state) => state.parsing.status);
  const parsingError = useStore((state) => state.parsing.error);
  const resetAll = useStore((state) => state.resetAll);
  const updateLastActive = useStore(
    (state) => state.updateLastActive,
  );
  const analysisOpen = useStore((state) => state.analysis.isOpen);
  const layerDataTableOpen = useStore(
    (state) => state.ui.layerDataTable?.isOpen,
  );
  const fieldValidationOpen = useStore(
    (state) => state.ui.fieldValidationOpen,
  );
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [dockedInspectorOpen, setDockedInspectorOpen] = useState(false);
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const closeDataInspector = useStore(
    (state) => state.closeDataInspector,
  );
  const [zoomLevel, setZoomLevel] = useState(13);
  const primaryViewHeight = analysisOpen
    ? 'var(--profile-map-height, 55%)'
    : '100%';
  const inspectorWidthPx = VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM * 16;
  const canDockInspector =
    viewportWidth - sidebarWidth >= 480 + inspectorWidthPx;

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  // State for "Add Layer" modal
  const [showAddLayerModal, setShowAddLayerModal] = useState(false);

  // State for WMS layer modal
  const [showWmsModal, setShowWmsModal] = useState(false);
  const [geminiDialog, setGeminiDialog] = useState(null);
  const customWmsConfig = useStore((state) => state.customWmsConfig);

  // State for stats modal
  const [showStats, setShowStats] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAppInfo, setShowAppInfo] = useState(false);
  const [photoImport, setPhotoImport] = useState(null);
  const surveyLayers = useStore((state) => state.layers);
  const gmiEditLayerId = useStore((state) => state.gmiEditWorkspace?.layerId ?? null);
  const gmiEditTableExpanded = useStore((state) => state.gmiEditTableExpanded);
  // A pending global reset that would discard GMI corrections: { layers } until the user confirms or cancels.
  const [resetConfirm, setResetConfirm] = useState(null);
  // The right-hand inspector slot of Rettinger; the workspace portals its object editor into it.
  const [gmiEditInspector, setGmiEditInspector] = useState(null);
  // Unsubmitted Rettinger form values: the workspace owns the draft and its confirmation dialog; the page only
  // learns whether one exists and asks the workspace's guard before anything that would unmount it.
  const gmiEditGuardRef = useRef(null);
  const registerGmiEditGuard = useCallback((guard) => { gmiEditGuardRef.current = guard; }, []);
  const [gmiEditDraft, setGmiEditDraft] = useState(false);
  const [photoWorkspace, dispatchPhotoWorkspace] = useReducer(photoWorkspaceReducer, emptyPhotoWorkspace);
  // Staged Edit-mode values and undo/redo live here, never in photoSession; the session only holds the ticket.
  const [photoEdit, dispatchPhotoEdit] = useReducer(photoEditReducer, emptyPhotoEditState);
  const photoEditTicketRef = useRef(null);
  const photoEditStateRef = useRef(photoEdit);
  useEffect(() => { photoEditStateRef.current = photoEdit; });
  const photoMapCenterRef = useRef(null);
  const [photoMapDisplay, setPhotoMapDisplay] = usePhotoMapDisplayPreference();
  const [photoNotice, setPhotoNotice] = useState(null);
  const [photoDialog, setPhotoDialog] = useState(null);
  // Transient per-layer export choices, shared by Fullfør opplysninger and the export dialog. Never persisted.
  const [photoExportConfigs, setPhotoExportConfigs] = useState(() => new Map());
  // One handoff from Fullfør opplysninger to the map or the positioning wizard. Never persisted. The ref lets a Save/Discard
  // continuation, created before the boundary dialog opened, see what is current when it runs.
  const [photoExportFlow, setPhotoExportFlow] = useState(null);
  const photoExportFlowRef = useRef(null);
  const [photoCompletionEntry, setPhotoCompletionEntry] = useState(null);
  // One trip from the export wizard to the hub and back. It outlives the handoffs above, so it is kept apart from them:
  // a trip to the map ends the handoff when it comes back to the hub, and this only when the hub goes back to export.
  const [photoExportReturn, setPhotoExportReturn] = useState(null);
  const [photoExportResumed, setPhotoExportResumed] = useState(false);
  const photoToolOpenerRef = useRef(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoBoundary, setPhotoBoundary] = useState(null);
  // Non-drag move for crowded places: the next map click moves the selected placed photo. Bound to one occurrence.
  const [photoClickMoveId, setPhotoClickMoveId] = useState(null);
  const [photoAnnouncement, setPhotoAnnouncement] = useState('');
  const [photoPanRequest, setPhotoPanRequest] = useState(null);
  const notifyPhoto = (text, tone = 'success', action = null) => setPhotoNotice({ id: `${Date.now()}-${Math.random()}`, text, tone, action });
  const dismissPhotoNotice = (id) => setPhotoNotice((notice) => notice?.id === id ? null : notice);
  const workspaceLayer = photoLayers.find((layer) => layer.id === photoWorkspace.layerId);
  // Rettinger (GMI field corrections) is a sibling of the FOTO and Validator workspaces; FOTO wins if both are requested.
  const gmiEditActive = !workspaceLayer && Boolean(gmiEditLayerId && surveyLayers[gmiEditLayerId]);
  // Runs `action` now, or after the Rettinger draft dialog when unsubmitted form values exist. Cancel = nothing happens.
  const guardGmiEditDraft = (action) => {
    const guard = gmiEditActive ? gmiEditGuardRef.current : null;
    if (guard) guard(action, 'objektet'); else action();
  };
  // photoLayers is a new array on every publish, so every derived photo list follows the session snapshot.
  const workspacePhotos = useMemo(() => photoLayers.some((layer) => layer.id === photoWorkspace.layerId)
    ? photoSession.getLayerPhotos(photoWorkspace.layerId) : [], [photoLayers, photoWorkspace.layerId]);
  const photoEditing = Boolean(workspaceLayer) && photoWorkspace.mode === 'edit' && photoEditIsActive(photoEdit);
  const effectiveWorkspacePhotos = useMemo(() => photoEditing ? workspacePhotos.map((photo) => effectivePhoto(photo, photoEdit)) : workspacePhotos,
    [photoEditing, workspacePhotos, photoEdit]);
  const changedIds = useMemo(() => new Set(photoEditing ? changedPhotoIds(photoEdit) : []), [photoEditing, photoEdit]);
  // Combined-delivery decisions (M8) are read from the session like the photos, on every publish.
  const workspaceDelivery = useMemo(() => photoLayers.some((layer) => layer.id === photoWorkspace.layerId)
    ? photoSession.getLayerDelivery(photoWorkspace.layerId) : null, [photoLayers, photoWorkspace.layerId]);
  const workspaceView = useMemo(() => photoWorkspaceView(effectiveWorkspacePhotos, photoWorkspace, { changedIds, delivery: workspaceDelivery }),
    [effectiveWorkspacePhotos, photoWorkspace, changedIds, workspaceDelivery]);
  const activeWorkspacePhoto = effectiveWorkspacePhotos.find((photo) => photo.id === photoWorkspace.activePhotoId);
  const activeSiblings = activeWorkspacePhoto ? effectiveWorkspacePhotos.filter((photo) => photo.assetId === activeWorkspacePhoto.assetId) : [];
  const [photoSourceWorkflow, setPhotoSourceWorkflow] = useState(null);
  const sourceWorkflowLayer = photoLayers.find((layer) => layer.id === photoSourceWorkflow?.layerId);
  const [photoLocateRequest, setPhotoLocateRequest] = useState(null);
  const photoTriggerRef = useRef(null);

  const changePhotoExportFlow = (flow) => { photoExportFlowRef.current = flow; setPhotoExportFlow(flow); };
  const closePhotoExportFlow = () => {
    const flow = photoExportFlowRef.current;
    if (!flow) return null;
    changePhotoExportFlow(null);
    if (!photoExportFlowIsLive(flow, photoSession.getSnapshot().photoLayers)) return null;
    dispatchPhotoWorkspace({ type: 'filter', filter: { ...flow.restore.filter, work: null } });
    if (flow.restore.activePhotoId) dispatchPhotoWorkspace({ type: 'active', photoId: flow.restore.activePhotoId });
    return flow;
  };
  const endPhotoExportTrip = () => { closePhotoExportFlow(); setPhotoExportReturn(null); };
  // Runs after the Save/Discard boundary is settled. The hub then reads canonical photos when it mounts, so a saved
  // value counts and a discarded one never did. With the layer gone there is nothing to come back to.
  const returnToPhotoCompletion = () => {
    const flow = closePhotoExportFlow();
    if (!flow) return;
    setPhotoCompletionEntry({ task: flow.task, selections: flow.restore.selections });
    setPhotoDialog('complete');
    ignoreFollowUpClick();
  };
  const endPhotoEditSession = () => {
    const ticket = photoEditTicketRef.current;
    photoEditTicketRef.current = null;
    if (ticket) photoSession.endPhotoEdits(ticket);
    dispatchPhotoEdit({ type: 'end' });
    dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' });
  };
  const enterPhotoEditMode = (photoId = photoWorkspace.activePhotoId) => {
    if (!workspaceLayer || photoWorkspace.mode === 'edit') return false;
    const hidden = !workspaceLayer.visible;
    if (hidden) photoSession.setLayerVisibility(workspaceLayer.id, true);
    const ticket = photoSession.beginPhotoEdits(workspaceLayer.id);
    if (!ticket) return false;
    photoEditTicketRef.current = ticket;
    setPhotoClickMoveId(null);
    dispatchPhotoEdit({ type: 'start', ticket });
    dispatchPhotoWorkspace({ type: 'mode', mode: 'edit' });
    // The command bar appears over the map: make sure the selected photo is not hidden underneath it.
    if (photoId) setPhotoPanRequest({ layerId: workspaceLayer.id, photoId, at: Date.now() });
    if (hidden) notifyPhoto('Laget vises mens du redigerer', 'info');
    return true;
  };
  // A commit that failed, other than by conflict. `ticket` may still be registered, as after an invalid change, and the
  // session holds automatic metadata for the layer until it is released. A ticket that has already ended is a no-op.
  const abandonPhotoEdits = (ticket) => {
    photoEditTicketRef.current = ticket;
    endPhotoEditSession();
    setPhotoBoundary(null);
    endPhotoExportTrip();
    notifyPhoto('Redigeringen ble avsluttet fordi fotolaget ble endret.', 'error');
  };
  // One commit for the whole session: every change is validated before anything is written.
  const savePhotoEdits = (then = null) => {
    const ticket = photoEditTicketRef.current;
    const changes = photoEditChanges(photoEdit);
    // The commit's own publish ends the registration; the subscriber must not treat it as an external end.
    photoEditTicketRef.current = null;
    const result = photoSession.applyPhotoEdits(ticket, changes);
    if (result.ok) {
      dispatchPhotoEdit({ type: 'end' });
      dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' });
      setPhotoBoundary(null);
      if (changes.length) notifyPhoto(`Endringer lagret for ${changes.length} ${changes.length === 1 ? 'bilde' : 'bilder'}`);
      then?.();
      return;
    }
    if (result.error === 'edit-conflict') {
      photoEditTicketRef.current = ticket;
      setPhotoBoundary({ variant: 'conflict', staleIds: result.staleIds, then });
      return;
    }
    abandonPhotoEdits(ticket);
  };
  const discardPhotoEdits = (then = null) => { endPhotoEditSession(); setPhotoBoundary(null); then?.(); };
  // The single unsaved-changes boundary: every action that leaves Edit mode or opens a photo-data tool.
  // Going anywhere else ends a handoff from Fullfør opplysninger, but only once the boundary has been passed:
  // choosing Fortsett redigering leaves the handoff as it was. The way back to export ends with a live handoff, and not
  // otherwise: the hub's own step to the map comes through here too, before any handoff exists.
  const requestWorkspaceAction = (action = () => {}, { keepFlow = false } = {}) => {
    const run = keepFlow ? action : () => { if (closePhotoExportFlow()) setPhotoExportReturn(null); action(); };
    if (photoWorkspace.mode === 'remove' || photoWorkspace.mode === 'delivery') dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' });
    if (photoWorkspace.mode !== 'edit') { run(); return; }
    if (!changedPhotoIds(photoEdit).length) { endPhotoEditSession(); run(); return; }
    setPhotoBoundary({ variant: 'boundary', then: run });
  };
  // Every way out of Edit mode: without a handoff the return is a no-op, so ordinary editing behaves as before.
  const leavePhotoEditMode = () => requestWorkspaceAction(returnToPhotoCompletion, { keepFlow: true });
  const stagePhotoEdit = (photoId, field, value, coalesceKey = null) => dispatchPhotoEdit({ type: 'stage', photoId, field, value, coalesceKey, at: Date.now() });
  const selectWorkspacePhoto = (photoId, { pan = false } = {}) => {
    dispatchPhotoWorkspace({ type: 'active', photoId });
    if (pan && workspaceLayer) setPhotoPanRequest({ layerId: workspaceLayer.id, photoId, at: Date.now() });
  };
  // Undo/redo select the affected occurrence and announce; selection itself is never history.
  const travelPhotoEdit = (direction) => {
    const entry = (direction === 'undo' ? photoEdit.past : photoEdit.future).at(-1);
    if (!entry) return;
    dispatchPhotoEdit({ type: direction });
    selectWorkspacePhoto(entry.photoId, { pan: true });
    const filename = workspacePhotos.find((photo) => photo.id === entry.photoId)?.originalFilename || 'bildet';
    const what = entry.field === 'position' ? `flytting av ${filename}` : `retning for ${filename}`;
    setPhotoAnnouncement(`${direction === 'undo' ? 'Angret' : 'Gjorde om'} ${what}`);
  };
  const openPhotoSources = (context = {}) => {
    if (!workspaceLayer) return;
    requestWorkspaceAction(() => setPhotoSourceWorkflow({ layerId: workspaceLayer.id, ...context }));
  };
  const beginNewPhotoImport = (opener) => {
    setPhotoSourceWorkflow(null);
    photoSession.beginImport();
    photoTriggerRef.current = opener;
    setPhotoImport({ kind: 'new', targetLayerId: null });
  };
  const openPhotos = (event) => {
    const opener = event.currentTarget;
    requestWorkspaceAction(() => beginNewPhotoImport(opener));
  };
  const openLoadedGmiPhotos = (layerId, event) => {
    const ticket = loadedGmiSources.begin(layerId);
    if (!ticket) return;
    setPhotoSourceWorkflow(null);
    photoTriggerRef.current = event.currentTarget;
    setPhotoImport({ kind: 'gmi-layer', gmiLayerId: layerId, targetLayerId: null });
    void photoSession.beginLoadedGmiImport({ binding: ticket.binding,
      read: () => loadedGmiSources.read(ticket), isLive: loadedGmiSources.isLive });
  };
  const enterPhotoLayer = (id, opener, photoId) => {
    const layer = photoSession.getLayer(id);
    if (!layer) return;
    if (opener) photoTriggerRef.current = opener;
    closeDataInspector();
    setPhotoDialog(null);
    setPhotoViewerOpen(false);
    changePhotoExportFlow(null);
    setPhotoExportReturn(null);
    dispatchPhotoWorkspace({ type: 'enter', layerId: id, photoId, photoIds: layer.photoIds });
    useStore.getState().setActiveViewTab('map');
  };
  const openPhotoLayer = (id, opener, photoId = null) => guardGmiEditDraft(() => {
    if (id !== photoWorkspace.layerId) requestWorkspaceAction(() => enterPhotoLayer(id, opener, photoId));
    else enterPhotoLayer(id, opener, photoId);
  });
  const exitPhotoWorkspace = () => requestWorkspaceAction(() => {
    setPhotoSourceWorkflow(null);
    setPhotoDialog(null);
    setPhotoExportReturn(null);
    setPhotoNotice(null);
    setPhotoViewerOpen(false);
    dispatchPhotoWorkspace({ type: 'exit' });
    if (photoTriggerRef.current?.isConnected) photoTriggerRef.current.focus();
  });
  const addPhotosToLayer = (opener) => requestWorkspaceAction(() => {
    if (!photoSession.beginImport(workspaceLayer?.id)) return;
    photoTriggerRef.current = opener;
    setPhotoImport({ kind: 'append', targetLayerId: workspaceLayer.id });
  });
  const changePhotoExportConfig = (layerId, patch) => setPhotoExportConfigs((configs) => updatePhotoExportConfig(configs, layerId, patch));
  const openCompletePhotoDetails = (opener) => requestWorkspaceAction(() => { photoToolOpenerRef.current = opener; setPhotoExportReturn(null); setPhotoCompletionEntry(null); setPhotoDialog('complete'); });
  // Swap, never stack. The wizard unmounts and takes its plan with it, so what comes back is always Leveranse, recalculated.
  const openCompletionFromExport = () => requestWorkspaceAction(() => {
    setPhotoExportReturn({ layerId: workspaceLayer.id });
    setPhotoCompletionEntry(null);
    setPhotoDialog('complete');
    ignoreFollowUpClick();
  });
  const openExportFromCompletion = ({ resumed }) => {
    setPhotoExportReturn(null);
    setPhotoExportResumed(resumed);
    setPhotoDialog('export');
    ignoreFollowUpClick();
  };
  // Swap, never stack: the hub closes and Edit mode takes over. The hub is open, so the boundary has nothing to ask here.
  const openPhotoCompletionMap = ({ task, scope, photoIds, focusId, selections }) => requestWorkspaceAction(() => {
    const flow = createPhotoExportFlow({ layerId: workspaceLayer.id, task, scope, workIds: photoIds, focusId, photos: workspacePhotos, workspace: photoWorkspace, selections });
    if (!flow || !enterPhotoEditMode(flow.focusId)) return;
    changePhotoExportFlow(flow);
    setPhotoDialog(null);
    dispatchPhotoWorkspace({ type: 'filter', filter: photoExportFlowFilter(flow) });
    dispatchPhotoWorkspace({ type: 'active', photoId: flow.focusId });
    ignoreFollowUpClick();
  });
  const openPhotoCompletionSources = ({ selections }) => requestWorkspaceAction(() => {
    changePhotoExportFlow(createPhotoExportFlow({ layerId: workspaceLayer.id, task: 'placement', route: 'positioning', workspace: photoWorkspace, selections }));
    setPhotoDialog(null);
    setPhotoSourceWorkflow({ layerId: workspaceLayer.id });
    ignoreFollowUpClick();
  });
  // The wizard keeps its own transaction. Whatever it ended with, applied or cancelled, is already canonical here.
  const closePhotoSources = () => { setPhotoSourceWorkflow(null); returnToPhotoCompletion(); };
  const runWorkspaceTool = (tool, opener) => {
    if (tool === 'add') addPhotosToLayer(opener);
    else if (tool === 'edit') { if (photoWorkspace.mode !== 'edit') requestWorkspaceAction(enterPhotoEditMode); }
    else if (tool === 'sources') openPhotoSources();
    else if (tool === 'info') requestWorkspaceAction(() => setPhotoDialog('info'));
    // During a handoff this is the way back, so the task it came from is not lost.
    else if (tool === 'complete') { if (photoExportFlow) leavePhotoEditMode(); else openCompletePhotoDetails(opener); }
    else if (tool === 'export') requestWorkspaceAction(() => { photoToolOpenerRef.current = opener; setPhotoExportReturn(null); setPhotoExportResumed(false); setPhotoDialog('export'); });
    else if (tool === 'remove') requestWorkspaceAction(() => dispatchPhotoWorkspace({ type: 'mode', mode: 'remove' }));
    else if (tool === 'delivery') requestWorkspaceAction(() => dispatchPhotoWorkspace({ type: 'mode', mode: 'delivery' }));
  };
  const closePhotos = () => {
    photoSession.cancelImport();
    setPhotoImport(null);
  };
  const locatePhoto = (request) => {
    if (!photoSession.getLayer(request.layerId)?.photoIds.includes(request.photoId)) return;
    setPhotoLocateRequest({ ...request, kind: 'photo' });
    useStore.getState().setActiveViewTab('map');
  };
  const onPhotoFlowInvalid = useEffectEvent(endPhotoExportTrip);
  useEffect(() => photoSession.subscribe(() => {
    if (photoExportFlowRef.current && !photoExportFlowIsLive(photoExportFlowRef.current, photoSession.getSnapshot().photoLayers)) onPhotoFlowInvalid();
    setPhotoExportReturn((trip) => trip && !photoSession.getLayer(trip.layerId) ? null : trip);
    setPhotoLocateRequest((request) => request && !photoSession.getLayer(request.layerId)?.photoIds.includes(request.photoId) ? null : request);
    setPhotoSourceWorkflow((workflow) => workflow && !photoSession.getLayer(workflow.layerId) ? null : workflow);
    dispatchPhotoWorkspace({ type: 'reconcile', layers: photoSession.getSnapshot().photoLayers });
    setPhotoExportConfigs((configs) => reconcilePhotoExportConfig(configs, photoSession.getSnapshot().photoLayers.map((layer) => layer.id)));
    const ticket = photoEditTicketRef.current;
    if (!ticket) return;
    if (!photoSession.photoEditsAreLive(ticket)) {
      photoEditTicketRef.current = null;
      dispatchPhotoEdit({ type: 'end' });
      dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' });
      setPhotoBoundary(null);
      onPhotoFlowInvalid();
      setPhotoNotice({ id: `${Date.now()}`, text: 'Redigeringen ble avsluttet fordi fotolaget ble endret.', tone: 'error', action: null });
      return;
    }
    const live = photoSession.getLayer(ticket.layerId).photoIds;
    const dropped = changedPhotoIds(photoEditStateRef.current).filter((id) => !live.includes(id)).length;
    dispatchPhotoEdit({ type: 'reconcile', livePhotoIds: live });
    if (dropped) setPhotoNotice({ id: `${Date.now()}`, text: `${dropped} ${dropped === 1 ? 'endring ble' : 'endringer ble'} fjernet fordi bildet ikke lenger finnes.`, tone: 'error', action: null });
  }), []);
  useEffect(() => photoSession.subscribe(() => {
    if (photoImport?.targetLayerId && !photoSession.getLayer(photoImport.targetLayerId)) setPhotoImport(null);
  }), [photoImport]);
  const completePhotoImport = (result) => {
    const append = Boolean(result.append);
    setPhotoImport(null);
    useStore.getState().toggleFieldValidation(false);
    openPhotoLayer(result.layer.id);
    if (result.placementError) notifyPhoto('Bildene er lagt til, men posisjonene ble ikke brukt. Kontroller kildene i fotolaget.', 'error',
      { label: 'Koble og posisjoner bilder…', run: () => setPhotoSourceWorkflow({ layerId: result.layer.id }) });
    else notifyPhoto(`${append ? `${result.addedCount} bilder er lagt til.` : 'Fotolaget er opprettet.'} ${result.outcome.placed} av ${result.outcome.total} bilder er plassert.`);
  };
  // Edit mode keyboard: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; Escape after tooltips, gestures and menus.
  const onPhotoWorkspaceKey = useEffectEvent((event) => {
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    const typing = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const key = event.key?.toLowerCase();
    if (photoEditing && (event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || (key === 'y' && event.ctrlKey))) {
      if (typing) return;
      event.preventDefault();
      travelPhotoEdit(key === 'z' && !event.shiftKey ? 'undo' : 'redo');
      return;
    }
    if (event.key !== 'Escape') return;
    if (photoEditing) { event.preventDefault(); leavePhotoEditMode(); }
    else if (photoWorkspace.mode === 'remove' || photoWorkspace.mode === 'delivery') { event.preventDefault(); dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' }); }
  });
  const photoKeysActive = Boolean(workspaceLayer) && photoWorkspace.mode !== 'browse';
  useEffect(() => {
    if (!photoKeysActive) return undefined;
    const listener = (event) => onPhotoWorkspaceKey(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [photoKeysActive]);
  // Edit mode: the selected occurrence's exact-coordinate stack (as drawn on the map) for click cycling and its badge.
  const photoEditStackIds = useMemo(() => photoEditing && activeWorkspacePhoto
    ? photoStackMembers(effectiveWorkspacePhotos.filter((photo) => workspaceView.visibleIds.has(photo.id)), activeWorkspacePhoto).map((photo) => photo.id) : [],
  [photoEditing, activeWorkspacePhoto, effectiveWorkspacePhotos, workspaceView]);
  const photoClickMove = photoEditing && Boolean(activeWorkspacePhoto) && photoClickMoveId === activeWorkspacePhoto.id;
  const photoEditConnectors = useMemo(() => photoEditing ? effectiveWorkspacePhotos.filter((photo) => photo.staged?.position
    && isPhotoPosition(photo.saved?.current?.position) && workspaceView.visibleIds.has(photo.id)).map((photo) => ({ photoId: photo.id, positions: [
    [photo.saved.current.position.latitude, photo.saved.current.position.longitude],
    [photo.spatial.current.position.latitude, photo.spatial.current.position.longitude]] })) : [], [photoEditing, effectiveWorkspacePhotos, workspaceView]);
  const completionFromExport = Boolean(workspaceLayer) && photoExportReturn?.layerId === workspaceLayer.id;
  const photoFlowBar = photoEditing && photoExportFlow?.route === 'edit' ? { progress: photoExportFlowProgress(photoExportFlow, effectiveWorkspacePhotos, photoWorkspace.activePhotoId),
    onSelect: (photoId) => {
      selectWorkspacePhoto(photoId, { pan: true });
      setPhotoAnnouncement(`Valgte ${effectiveWorkspacePhotos.find((photo) => photo.id === photoId)?.originalFilename || 'bildet'}`);
    } } : null;
  // GMI layers loaded in the app can be used as photo sources by both wizards (import and source positioning).
  const loadedGmiLayers = Object.values(surveyLayers).filter((layer) => loadedGmiSources.available(layer.id))
    .map((layer) => ({ id: layer.id, name: layer.name || layer.file?.name || layer.id }));
  const loadedGmiInput = (layerId) => {
    const ticket = loadedGmiSources.begin(layerId);
    return ticket ? { binding: ticket.binding, read: () => loadedGmiSources.read(ticket), isLive: loadedGmiSources.isLive } : null;
  };
  const attachLoadedGmi = (layerId) => {
    const ticket = loadedGmiSources.begin(layerId);
    if (ticket) void photoSession.setDraftGmiSource({ binding: ticket.binding, read: () => loadedGmiSources.read(ticket), isLive: loadedGmiSources.isLive });
  };
  // The page owns the session; ordinary dialog/workspace mounts do not clear it.
  useEffect(() => () => photoSession.clear(), []);
  const [appInfoInitialTab, setAppInfoInitialTab] = useState('about');
  const appInfoTriggerRef = useRef(null);
  const appInfoAutoCheckedRef = useRef(false);

  // Decide and claim the first info popup before the heartbeat can create the legacy key.
  useEffect(() => {
    if (appInfoAutoCheckedRef.current) return;
    appInfoAutoCheckedRef.current = true;

    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // The info modal remains usable when browser storage is unavailable.
    }

    const decision = decideAutomaticAppInfo({
      storage,
      latestAnnouncedRelease: LATEST_ANNOUNCED_RELEASE,
    });
    if (!decision.open) return;

    startTransition(() => {
      setAppInfoInitialTab(decision.tab);
      setShowAppInfo(true);
    });
  }, []);

  // Session heartbeat: update lastActive timestamp
  useEffect(() => {
    // Update immediately on mount
    updateLastActive();

    // Update every minute while active
    const interval = setInterval(updateLastActive, 60 * 1000);

    // Update on tab focus/visibility
    const handleActivity = () => {
      if (document.visibilityState === 'visible') {
        updateLastActive();
      }
    };

    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('focus', handleActivity);
    window.addEventListener('click', handleActivity); // Optional: track clicks too

    return () => {
      clearInterval(interval);
      document.removeEventListener(
        'visibilitychange',
        handleActivity,
      );
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [updateLastActive]);

  // Dev-only persistent breadcrumbs for crashes/OOM (survive renderer restarts)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const captureSnapshot = (reason = 'interval') => {
      const state = useStore.getState();
      const terrainStats = getTerrainStats();
      const heap =
        typeof performance !== 'undefined' && performance.memory
          ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit,
            }
          : null;

      const layerIds = state.layerOrder || [];
      let layerQueueTotal = 0;
      for (const layerId of layerIds) {
        layerQueueTotal +=
          state.layers[layerId]?.terrain?.fetchQueue?.length || 0;
      }

      appendDevRuntimeItem(DEV_RUNTIME_SNAPSHOTS_KEY, {
        ts: new Date().toISOString(),
        reason,
        parsingStatus: state.parsing?.status,
        activeViewTab: state.ui?.activeViewTab,
        analysisOpen: !!state.analysis?.isOpen,
        layerCount: layerIds.length,
        baseQueue: state.terrain?.fetchQueue?.length || 0,
        layerQueueTotal,
        terrainCacheSize: terrainStats.cacheSize,
        terrainCacheLimit: terrainStats.cacheLimit,
        terrainCacheEvictions: terrainStats.cacheEvictions,
        terrainApiQueue: terrainStats.requestQueueLength,
        terrainApiQueueMax: terrainStats.maxRequestQueueLength,
        heap,
      });
    };

    const onError = (event) => {
      appendDevRuntimeItem(DEV_RUNTIME_EVENTS_KEY, {
        ts: new Date().toISOString(),
        type: 'error',
        message: event?.message || 'Unknown error',
        source: event?.filename || null,
        line: event?.lineno || null,
        column: event?.colno || null,
      });
      captureSnapshot('window-error');
    };

    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      appendDevRuntimeItem(DEV_RUNTIME_EVENTS_KEY, {
        ts: new Date().toISOString(),
        type: 'unhandledrejection',
        message:
          reason?.message ||
          (typeof reason === 'string'
            ? reason
            : 'Unhandled rejection'),
      });
      captureSnapshot('unhandled-rejection');
    };

    captureSnapshot('mount');
    const interval = setInterval(
      () => captureSnapshot('interval'),
      5000,
    );

    window.addEventListener('error', onError);
    window.addEventListener(
      'unhandledrejection',
      onUnhandledRejection,
    );

    return () => {
      clearInterval(interval);
      window.removeEventListener('error', onError);
      window.removeEventListener(
        'unhandledrejection',
        onUnhandledRejection,
      );
      captureSnapshot('unmount');
    };
  }, []);

  // The GMI decision comes first: a reset that would discard unsaved corrections is refused before any FOTO or page
  // state is touched, so cancelling leaves everything exactly as it was. Only an explicit confirmation discards.
  // User-initiated reset: unsubmitted Rettinger form values are decided first, then staged corrections (handleReset).
  const requestReset = () => guardGmiEditDraft(() => handleReset());
  const handleReset = ({ discardGmiEdits = false } = {}) => {
    const blocked = gmiEditRemovalBlock(null, { discardGmiEdits });
    if (blocked) { setResetConfirm({ layers: blocked.layers }); return; }
    setResetConfirm(null);
    setPhotoImport(null);
    setPhotoLocateRequest(null);
    // An explicit global reset: staged edits are lost with the whole photo session.
    if (photoEditTicketRef.current) endPhotoEditSession();
    changePhotoExportFlow(null);
    setPhotoExportReturn(null);
    setPhotoDialog(null); setPhotoBoundary(null); setPhotoNotice(null); setPhotoViewerOpen(false);
    dispatchPhotoWorkspace({ type: 'exit' });
    closeDataInspector();
    resetAll({ discardGmiEdits });
  };

  const openAppInfo = (tab = 'about', opener = null) => {
    if (opener) {
      appInfoTriggerRef.current = opener;
      opener.focus();
    }
    setAppInfoInitialTab(tab);
    setShowAppInfo(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gmi-surface-soft">
      {/* A window drop starts parsing, which unmounts the workspace: refused while a Rettinger form has unsubmitted values. */}
      <GlobalFileDrop enabled={parsingStatus !== 'parsing' && !photoImport && !workspaceLayer && !(gmiEditActive && gmiEditDraft)} />
      <TestModeActivation />
      {photoImport && <PhotoImportWizard context={photoImport} onClose={closePhotos} onComplete={completePhotoImport} openerRef={photoTriggerRef}
        loadedSources={loadedGmiLayers} onLoadedSource={attachLoadedGmi} />}
      {sourceWorkflowLayer && !photoImport && <PhotoPositioningWizard layer={sourceWorkflowLayer}
        photos={photoSession.getLayerPhotos(sourceWorkflowLayer.id)} review={sourceReviews[sourceWorkflowLayer.id]}
        initialSourceId={photoSourceWorkflow.sourceId} focusedPhotoId={photoSourceWorkflow.photoId}
        loadedSources={loadedGmiLayers} loadedSourceInput={loadedGmiInput} onClose={closePhotoSources} />}
      {workspaceLayer && !photoImport && photoDialog === 'info' && <PhotoSourcesInfoDialog layer={workspaceLayer} photos={workspacePhotos}
        onClose={() => setPhotoDialog(null)} onOpenSources={() => { setPhotoDialog(null); openPhotoSources(); }} />}
      {workspaceLayer && !photoImport && photoDialog === 'export' && <PhotoExportWizard key={workspaceLayer.id} layer={workspaceLayer} photos={workspacePhotos}
        config={photoExportConfigFor(photoExportConfigs, workspaceLayer.id)} onConfigChange={(patch) => changePhotoExportConfig(workspaceLayer.id, patch)} openerRef={photoToolOpenerRef}
        resumed={photoExportResumed} onOpenCompletion={openCompletionFromExport} onClose={() => setPhotoDialog(null)} />}
      {workspaceLayer && !photoImport && photoDialog === 'complete' && <PhotoCompletionDialog key={workspaceLayer.id} layer={workspaceLayer} photos={workspacePhotos}
        config={photoExportConfigFor(photoExportConfigs, workspaceLayer.id)} onConfigChange={(patch) => changePhotoExportConfig(workspaceLayer.id, patch)} openerRef={photoToolOpenerRef}
        entry={photoCompletionEntry} fromExport={completionFromExport} onOpenMap={openPhotoCompletionMap} onOpenSources={openPhotoCompletionSources}
        onOpenExport={() => openExportFromCompletion({ resumed: false })} onClose={completionFromExport ? () => openExportFromCompletion({ resumed: true }) : () => setPhotoDialog(null)} />}
      {workspaceLayer && !photoImport && photoViewerOpen && activeWorkspacePhoto?.dimensions && <PhotoWorkspaceViewer photo={activeWorkspacePhoto}
        photos={effectiveWorkspacePhotos} assetSequence={workspaceView.assetSequence} onClose={() => setPhotoViewerOpen(false)}
        onSelect={(photoId) => selectWorkspacePhoto(photoId, { pan: true })} />}
      {workspaceLayer && !photoImport && photoDialog === 'metadata' && activeWorkspacePhoto && <PhotoCaptureMetadataDialog key={activeWorkspacePhoto.assetId}
        photo={workspacePhotos.find((photo) => photo.id === activeWorkspacePhoto.id)} layerId={workspaceLayer.id} occurrenceCount={activeSiblings.length}
        onClose={() => setPhotoDialog(null)} onSaved={(text) => notifyPhoto(text)} />}
      {photoBoundary && photoEditing && <PhotoEditBoundaryDialog variant={photoBoundary.variant} changedCount={changedIds.size} staleCount={photoBoundary.staleIds?.length || 0}
        onContinue={() => setPhotoBoundary(null)} onDiscard={() => discardPhotoEdits(photoBoundary.then)}
        onSave={() => {
          if (photoBoundary.variant === 'conflict') {
            // Drop only the conflicting occurrences, then retry the same session for the rest.
            const stale = photoBoundary.staleIds, then = photoBoundary.then;
            const changes = photoEditChanges(photoEdit).filter((change) => !stale.includes(change.photoId));
            dispatchPhotoEdit({ type: 'drop', photoIds: stale });
            const ticket = photoEditTicketRef.current;
            photoEditTicketRef.current = null;
            const result = photoSession.applyPhotoEdits(ticket, changes);
            if (result.ok) {
              dispatchPhotoEdit({ type: 'end' }); dispatchPhotoWorkspace({ type: 'mode', mode: 'browse' }); setPhotoBoundary(null);
              notifyPhoto(`Endringer lagret for ${changes.length} ${changes.length === 1 ? 'bilde' : 'bilder'}`);
              then?.();
            } else if (result.error === 'edit-conflict') { photoEditTicketRef.current = ticket; setPhotoBoundary({ variant: 'conflict', staleIds: result.staleIds, then }); }
            else abandonPhotoEdits(ticket);
          } else savePhotoEdits(photoBoundary.then);
        }} />}
      {resetConfirm && <GmiConfirmDialog title="Nullstille og forkaste rettinger?" confirmLabel="Forkast rettinger og nullstill" testId="reset"
        onCancel={() => setResetConfirm(null)} onConfirm={() => handleReset({ discardGmiEdits: true })}>
        <p>Disse GMI-lagene har rettinger som ikke er lastet ned som revidert GMI:</p>
        <UnsavedGmiLayers layers={resetConfirm.layers} names={Object.fromEntries(Object.values(surveyLayers).map((layer) => [layer.id, layer.name]))} />
        <p>Nullstiller du, fjernes alle lag og rettingene forkastes. Velg «Avbryt» for å beholde alt og laste ned først.</p>
      </GmiConfirmDialog>}
      {/* Floating Stats Button */}
      {!workspaceLayer && !(layerDataTableOpen || dockedInspectorOpen || analysisOpen) && (
      <button
        className={`statistics-button${parsingStatus === 'done' ? ' statistics-button--workspace' : ''}`}
        onClick={() => setShowStats(true)}
        aria-label="Vis bruksstatistikk"
        title="Vis bruksstatistikk"
        style={{
          position: 'fixed',
          bottom: parsingStatus === 'done' ? '30px' : '16px',
          right: '16px',
          zIndex: 10002,
          padding: parsingStatus === 'done' ? '8px 14px' : '10px 16px',
          borderRadius: '12px',
          backgroundColor: '#007595',
          color: '#ffffff',
          border: '1px solid var(--gmi-brand-cyan)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: parsingStatus === 'done' ? '6px' : '8px',
          boxShadow: '0 6px 18px rgba(0,117,149,0.28)',
          fontSize: '13px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#0F172B';
          e.currentTarget.style.borderColor = '#0F172B';
          e.currentTarget.style.boxShadow =
            '0 6px 20px rgba(0,117,149,0.38)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            '#007595';
          e.currentTarget.style.borderColor = 'var(--gmi-brand-cyan)';
          e.currentTarget.style.boxShadow =
            '0 6px 18px rgba(0,117,149,0.28)';
        }}
      >
        <svg
          className={`text-gmi-brand-cyan${parsingStatus === 'done' ? ' h-[15px] w-[15px]' : ' h-4 w-4'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <span>Statistikk</span>
      </button>
      )}

      {/* Stats Modal */}
      <StatsModal
        isOpen={showStats}
        onClose={() => setShowStats(false)}
      />
      <AppInfoModal
        isOpen={showAppInfo}
        initialTab={appInfoInitialTab}
        onClose={() => setShowAppInfo(false)}
        openerRef={appInfoTriggerRef}
      />

      {/* Initial Upload Screen */}
      {parsingStatus !== 'done' && !hasPhotoLayers && (
        <div className="flex-1 flex items-center justify-center overflow-y-auto py-6">
          <div className="my-auto max-w-xl w-full px-4">
            <div className="text-center mb-8">
              <BrandWordmark large />
              <p className="mt-2 text-gmi-text-muted">
                Åpne og valider GMI-filer
              </p>
              <div className="mt-4 flex justify-center empty:hidden">
                <TestModeControl />
              </div>
            </div>

            {/* Error Display */}
            {parsingStatus === 'error' && parsingError && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-red-800">
                      Feil ved lasting av fil
                    </h3>
                    <p className="mt-1 text-sm text-red-700">
                      {parsingError}
                    </p>
                    <button
                      onClick={() => requestReset()}
                      className="mt-3 text-sm font-medium text-red-600 hover:text-red-800 underline"
                    >
                      Prøv igjen med en annen fil
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gmi-border bg-gmi-surface p-6 shadow-sm">
              <FileUpload />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={openPhotos}
                  aria-haspopup="dialog"
                  className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-1.5 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-xs font-medium"
                >
                  <ImagesIcon size={15} aria-hidden="true" />Bilder
                </button>
                <button
                  ref={appInfoTriggerRef}
                  type="button"
                  onClick={(event) => openAppInfo('about', event.currentTarget)}
                  aria-haspopup="dialog"
                  aria-label={`Om appen, versjon ${CURRENT_APP_VERSION}`}
                  title="Informasjon om appen og versjonshistorikk"
                  className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-1.5 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-xs font-medium"
                >
                  <InfoIcon size={15} weight="regular" aria-hidden="true" />
                  <span className="whitespace-nowrap">Om appen · v{CURRENT_APP_VERSION}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => openAppInfo('contact', event.currentTarget)}
                  aria-haspopup="dialog"
                  className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-1.5 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-xs font-medium"
                >
                  <EnvelopeSimpleIcon size={15} weight="regular" aria-hidden="true" />
                  <span className="whitespace-nowrap">Kontakt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main App Layout (Sidebar + Map) */}
      {(parsingStatus === 'done' || hasPhotoLayers) && (
        <>
          {/* Background terrain fetcher - runs in background */}
          <TerrainFetcher />

          <WorkspaceShell
            sidebarWidth={workspaceLayer ? 316 : gmiEditActive ? 330 : sidebarWidth}
            photoWorkspace={Boolean(workspaceLayer)}
            onOpenAppInfo={(event) => openAppInfo('about', event.currentTarget)}
            appInfoTriggerRef={appInfoTriggerRef}
            sidebar={workspaceLayer ? <PhotoWorkspaceCollection key={workspaceLayer.id} layer={workspaceLayer} photos={effectiveWorkspacePhotos}
              view={workspaceView} workspace={photoWorkspace} dispatch={dispatchPhotoWorkspace} editing={photoEditing} changedIds={changedIds}
              delivery={workspaceDelivery} onNotify={notifyPhoto} onExit={exitPhotoWorkspace} onTool={runWorkspaceTool} onSelect={(photoId) => selectWorkspacePhoto(photoId, { pan: true })} />
              : gmiEditActive ? <GmiEditWorkspace key={gmiEditLayerId} layerId={gmiEditLayerId} inspectorRoot={gmiEditInspector}
                onGuardChange={registerGmiEditGuard} onDraftChange={setGmiEditDraft} /> : fieldValidationOpen ? (
              <FieldValidationSidebar
                sidebarWidth={sidebarWidth}
                canDockInspector={canDockInspector}
                onDockedInspectorChange={setDockedInspectorOpen}
                onOpenContact={(event) => openAppInfo('contact', event.currentTarget)}
              />
            ) : (
              <Sidebar
                onReset={() => requestReset()}
                onOpenPhotoLayer={openPhotoLayer}
                onAddGmiPhotos={openLoadedGmiPhotos}
                onOpenGemini={() => setGeminiDialog({})}
                hasPhotoLayers={hasPhotoLayers}
                onAddFile={() => setShowAddLayerModal(true)}
                onAddPhotos={openPhotos}
                onOpenContact={(event) => openAppInfo('contact', event.currentTarget)}
                width={sidebarWidth}
                onWidthChange={setSidebarWidth}
              />
            )}
            bottomDockOpen={!workspaceLayer && layerDataTableOpen}
            bottomDock={<LayerDataTable />}
            expandedTable={gmiEditActive && gmiEditTableExpanded}
            primary={(
              <div className={`flex h-full min-h-0 min-w-0 flex-1${workspaceLayer ? ' photo-workspace-primary' : ''}`}>
                <MapPanePresentationProvider analysisOpen={analysisOpen} workspaceActive={Boolean(gmiEditLayerId || fieldValidationOpen)} className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
                {hasPhotoLayers && parsingStatus === 'error' && parsingError && (
                  <div role="alert" className="absolute inset-x-3 top-16 z-[1300] rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Feil ved lasting av fil: {parsingError}. Bruk «Legg til fil» for å prøve igjen.</div>
                )}
                {!workspaceLayer && <MapPaneToolbar
                  onReset={() => requestReset()}
                  onShare={() => setShowShareModal(true)}
                  showShare={parsingStatus === 'done'}
                />}
                <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {/* Show Map view when activeViewTab is 'map' or 3D viewer is not open */}
            {(workspaceLayer || !viewer3DOpen || activeViewTab === 'map') && (
              <>
                {/* Map fills the upper row, or leaves room for profile analysis */}
                <div
                  className="relative"
                  style={{
                    height: workspaceLayer ? '100%' : primaryViewHeight,
                    transition: 'height 0.2s ease',
                  }}
                >
                  <MapView onZoomChange={setZoomLevel} onOpenPhoto={(layerId, photoId, opener) => openPhotoLayer(layerId, opener, photoId)}
                    photoWorkspace={workspaceLayer ? { layerId: workspaceLayer.id, photoId: photoWorkspace.activePhotoId, activeAssetId: activeWorkspacePhoto?.assetId || null,
                      photos: effectiveWorkspacePhotos, visibleIds: workspaceView.visibleIds, displayMode: photoMapDisplay, onDisplayModeChange: setPhotoMapDisplay,
                      colourMode: photoWorkspace.colourMode, onColourModeChange: (value) => dispatchPhotoWorkspace({ type: 'map-colour', value }),
                      deliveryPopupTab: photoWorkspace.deliveryPopupTab, onDeliveryPopupTabChange: (value) => dispatchPhotoWorkspace({ type: 'delivery-popup-tab', value }),
                      delivery: workspaceDelivery, deliveryMode: photoWorkspace.mode === 'delivery', deliveryIds: photoWorkspace.deliveryIds,
                      onToggleDelivery: (photoId) => dispatchPhotoWorkspace({ type: 'toggle-delivery', photoId }),
                      zoom: zoomLevel, editing: photoEditing, hiddenPhotoId: photoEditing ? photoWorkspace.activePhotoId : null } : null}
                    onSelectPhoto={(photoId) => selectWorkspacePhoto(photoId)} photoPanRequest={photoPanRequest}
                    photoEdit={photoEditing ? { photo: activeWorkspacePhoto || null, connectors: photoEditConnectors, onStage: stagePhotoEdit,
                      onAnnounce: setPhotoAnnouncement, centerRef: photoMapCenterRef, stackIds: photoEditStackIds,
                      clickMove: photoClickMove, onClickMoveEnd: () => setPhotoClickMoveId(null) } : null}
                    photoDisplay={{ mode: photoMapDisplay, onChange: setPhotoMapDisplay, zoom: zoomLevel }}
                    photoLocateRequest={photoLocateRequest} onPhotoLocateHandled={() => setPhotoLocateRequest(null)} />
                  {photoEditing && <div className="photo-edit-command-anchor">
                    <PhotoEditCommandBar photo={activeWorkspacePhoto || null} siblingCount={activeSiblings.length} changedCount={changedIds.size}
                      canUndo={canUndoPhotoEdit(photoEdit)} canRedo={canRedoPhotoEdit(photoEdit)} onUndo={() => travelPhotoEdit('undo')} onRedo={() => travelPhotoEdit('redo')}
                      onSave={() => savePhotoEdits(returnToPhotoCompletion)} onDiscard={() => setPhotoBoundary({ variant: 'discard', then: returnToPhotoCompletion })} onExit={leavePhotoEditMode}
                      onStage={stagePhotoEdit} onMapCenter={() => photoMapCenterRef.current?.()} announcement={photoAnnouncement}
                      clickMove={photoClickMove} onClickMove={(active) => setPhotoClickMoveId(active ? activeWorkspacePhoto?.id || null : null)}
                      stackCount={photoEditStackIds.length} flow={photoFlowBar} />
                  </div>}
                  {workspaceLayer && photoNotice && <div className="photo-workspace-toast-anchor">
                    <PhotoWorkspaceToast key={photoNotice.id} notice={photoNotice} onDismiss={dismissPhotoNotice} />
                  </div>}
                  {hasPhotoLayers && !hasSurveyData && !photoEditing && photoLayers.every((layer) => layer.placedCount === 0) && (
                    <div className="pointer-events-none absolute bottom-16 left-3 right-3 rounded-lg border border-gmi-border bg-gmi-surface/95 p-3 text-center text-xs text-gmi-text-muted">
                      {workspaceLayer ? 'Bildene er uplassert. Bruk «Verktøy» → «Koble og posisjoner bilder…» for GMI, GML eller EXIF GPS, eller plasser dem med «Juster plassering og retning».' : 'Bildene er uplassert. Åpne bildemodulen for å kontrollere og bruke posisjoner.'}
                    </div>
                  )}

                  {/* Floating Zoom Indicator */}
                  <div
                    className="absolute bottom-4 left-4"
                    style={{ zIndex: 1000 }}
                  >
                    <div className="bg-gmi-surface/90 backdrop-blur px-3 py-2 rounded shadow border border-gmi-border text-gmi-text text-sm font-mono">
                      Zoom: {zoomLevel}
                    </div>
                  </div>

                  {/* WMS Layer Control - Small button near bottom left */}
                  <div
                    className="absolute bottom-4 left-28"
                    style={{ zIndex: 1000 }}
                  >
                    <div className="flex items-center gap-1">
                      <GeminiConnectionButton onOpen={() => setGeminiDialog({})} />
                      {/* WMS Settings Button */}
                      <button
                        onClick={() => setShowWmsModal(true)}
                        className="gmi-compact-button gmi-focus-ring px-2 py-1.5 shadow text-xs font-medium border bg-gmi-surface/90 border-gmi-border backdrop-blur flex items-center gap-1"
                        aria-label={customWmsConfig ? 'Endre WMS-innstillinger' : 'Legg til Gemini WMS'}
                        title={
                          customWmsConfig
                            ? 'Endre WMS-innstillinger'
                            : 'Legg til Gemini WMS'
                        }
                      >
                        {customWmsConfig ? (
                          <GearSixIcon size={14} weight="regular" aria-hidden="true" />
                        ) : (
                          <PlusIcon size={14} weight="regular" aria-hidden="true" />
                        )}
                        {customWmsConfig ? '' : 'WMS'}
                      </button>
                    </div>
                  </div>

                  {/* Floating Inspect Button - Only show when table is closed AND analysis is closed AND field validation is closed */}
                  {!workspaceLayer && !gmiEditActive && !analysisOpen && !fieldValidationOpen && parsingStatus === 'done' && (
                    <div
                      className="absolute bottom-4 -translate-x-1/2"
                      style={{
                        zIndex: 1000,
                        left: 'calc(50% - 320px)',
                      }}
                    >
                      <button
                        onClick={() => openDataInspector(null)}
                        className="gmi-compact-button gmi-focus-ring px-4 py-2 shadow font-medium border border-gmi-border bg-gmi-surface"
                      >
                        Inspiser data
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Show 3D view when viewer is open and activeViewTab is '3d' */}
            {!workspaceLayer && viewer3DOpen && activeViewTab === '3d' && (
              <div
                className="relative"
                style={{
                  height: primaryViewHeight,
                  transition: 'height 0.2s ease',
                }}
              >
                <Viewer3D />
              </div>
            )}

            {/* Profile analysis modal - overlays both 2D and 3D views */}
            {!workspaceLayer && <InclineAnalysisModal />}
          </div>
                </MapPanePresentationProvider>
          {workspaceLayer ? <aside className="photo-workspace-inspector" aria-label="Bildeinspektør">
            {!photoImport && <PhotoWorkspaceInspector key={activeWorkspacePhoto?.assetId || 'empty'} photo={activeWorkspacePhoto} layer={workspaceLayer}
              siblings={activeSiblings} editing={photoEditing} delivery={workspaceDelivery} onSelect={(photoId) => selectWorkspacePhoto(photoId, { pan: true })} onLocate={locatePhoto}
              onEditMetadata={() => requestWorkspaceAction(() => setPhotoDialog('metadata'))} onOpenViewer={() => setPhotoViewerOpen(true)} />}
          </aside> : gmiEditActive ? <aside id={GMI_EDIT_INSPECTOR_ROOT_ID} key={gmiEditLayerId} ref={setGmiEditInspector} className="gmi-edit-inspector" aria-label="Objektinspektør" />
            : <div id="validation-v2-field-inspector-root" className="contents" />}
        </div>
            )}
          />
        </>
      )}

      {/* Data Inspector Modal */}
      <DataDisplayModal />
      <ZValidationModal />

      {/* Add Layer Modal */}
      {showAddLayerModal && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-gmi-ink/50"
          onClick={() => setShowAddLayerModal(false)}
        >
          <div
            className="mx-4 w-full max-w-xl rounded-xl border border-gmi-border bg-gmi-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gmi-navy">
                Legg til nytt lag
              </h2>
              <button
                onClick={() => setShowAddLayerModal(false)}
                aria-label="Lukk legg til lag"
                className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
              >
                <XIcon size={24} weight="regular" aria-hidden="true" />
              </button>
            </div>
            <FileUpload
              isAddingLayer={true}
              onComplete={() => setShowAddLayerModal(false)}
            />
          </div>
        </div>
      )}

      {/* WMS Layer Modal */}
      {geminiDialog && <GeminiConnectionModal onClose={() => setGeminiDialog(null)} />}
      <WmsLayerModal
        isOpen={showWmsModal}
        onClose={() => setShowWmsModal(false)}
      />

      <ShareQrModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        repoUrl={PUBLIC_REPO_URL}
      />
    </div>
  );
}
