'use client';

/* eslint-disable @next/next/no-img-element -- Locally derived, bounded previews of verified package bytes. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileIcon, FolderIcon, FileZipIcon } from '@phosphor-icons/react';
import { deliveryInventory } from '@/lib/delivery/deliveryInventory.mjs';
import { readDeliveryAttachment } from '@/lib/delivery/deliveryPlan.mjs';
import { createPhotoThumbnail } from '@/lib/photos/imagePreview.mjs';

// Serial decoding bounds memory even when hundreds of rows enter view at once.
let previewQueue = Promise.resolve();
function Preview({ plan, attachment }) {
  const ref = useRef(null);
  const [state, setState] = useState(null);
  useEffect(() => {
    const request = new AbortController();
    let url;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      previewQueue = previewQueue.catch(() => {}).then(async () => {
        if (request.signal.aborted) return;
        try {
          const bytes = await readDeliveryAttachment(plan, attachment.assetId);
          if (request.signal.aborted) return;
          const file = new File([bytes], attachment.filename || attachment.path.split('/').at(-1));
          const result = await createPhotoThumbnail(file, { signal: request.signal, maxEdge: 96 });
          if (request.signal.aborted || !plan.isLive()) return;
          url = URL.createObjectURL(result.thumbnailBlob); setState(url);
        } catch { if (!request.signal.aborted) setState('failed'); }
      });
    }, { rootMargin: '80px' });
    observer.observe(ref.current);
    return () => { observer.disconnect(); request.abort(); if (url) URL.revokeObjectURL(url); };
  }, [plan, attachment]);
  return <span ref={ref} className="delivery-thumbnail">{state && state !== 'failed'
    ? <img src={state} alt="" loading="lazy" decoding="async" onError={() => setState('failed')} />
    : <span>{state === 'failed' ? 'Forhåndsvisning mangler' : '…'}</span>}</span>;
}

export default function DeliveryInventory({ plan }) {
  const { root, folders } = useMemo(() => deliveryInventory(plan), [plan]);
  const [closed, setClosed] = useState(() => new Set(folders));
  const [thumbnails, setThumbnails] = useState(false);
  const render = (nodes) => <ul>{nodes.map((node) => <li key={node.path} data-package-path={node.path}>
    {node.children ? <><button type="button" className="gmi-focus-ring delivery-folder" aria-expanded={!closed.has(node.path)} onClick={() => setClosed((previous) => {
      const next = new Set(previous); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next;
    })}><span aria-hidden="true">{closed.has(node.path) ? '▸' : '▾'}</span><FolderIcon weight="regular" aria-hidden="true" />{node.name}/ <small>({node.count} {node.count === 1 ? 'fil' : 'filer'})</small></button>
      {!closed.has(node.path) && render(node.children)}</>
      : <div className="delivery-file"><FileIcon aria-hidden="true" />{thumbnails && node.attachment && <Preview plan={plan} attachment={node.attachment} />}<span className="delivery-file-name">{node.name}</span>
        {node.destination && <span className="delivery-destination" data-destination={node.destination} aria-label={`Referert fra ${node.destination}`}>{node.destination}</span>}</div>}
  </li>)}</ul>;
  return <div data-package-contents className="delivery-tree">
    <div className="delivery-tree-controls"><button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => setClosed(new Set())}>Utvid alle</button>
      <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => setClosed(new Set(folders))}>Lukk alle</button>
      {plan.attachments.length > 0 && <label><input type="checkbox" checked={thumbnails} onChange={(event) => setThumbnails(event.target.checked)} /> Vis miniatyrbilder</label>}</div>
    {plan.mode === 'gmi-only' ? render(root.children) : <><p className="delivery-file"><FileZipIcon aria-hidden="true" /><strong>{root.name}</strong></p>{render(root.children)}</>}
  </div>;
}
