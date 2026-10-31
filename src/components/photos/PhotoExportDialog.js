'use client';

import { useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { capturePhotoExportSnapshot, buildPhotoExportPlan } from '@/lib/photos/export/photoExportPlan.mjs';
import { buildPhotoExportPackage } from '@/lib/photos/export/photoExportPackage.mjs';
import { PHOTO_EXPORT_PROFILES, EXPORT_CONTEXT_FIELDS, ASBUILT_CODES } from '@/lib/photos/export/exportContract.mjs';
import usePhotoSession from './usePhotoSession';
import PhotoEvidenceActions from './PhotoEvidenceActions';
import { groupPhotoExportDiagnostics } from '@/lib/photos/export/photoExportDiagnostics.mjs';
import './photoExport.css';

const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs disabled:opacity-40';

function Diagnostics({ items }) {
  return groupPhotoExportDiagnostics(items).map((group) => <details key={group.code} data-diagnostic-code={group.code}>
    <summary>{group.label} — {group.count}</summary>
    <ul>{group.items.map((item, index) => <li key={index}>{item.message}</li>)}</ul>
  </details>);
}

export default function PhotoExportDialog({ layerId, onClose }) {
  usePhotoSession();
  const ref = useRef(null), operation = useRef({ version: 0 });
  const [profile, setProfile] = useState('');
  const [crs, setCrs] = useState('EPSG:25832');
  const [context, setContext] = useState({});
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const urls = useRef(new Set());
  useEffect(() => {
    const controller = operation.current;
    const dialog = ref.current, opener = document.activeElement, activeUrls = urls.current;
    dialog.showModal();
    return () => {
      controller.version++; dialog.close();
      for (const url of activeUrls) URL.revokeObjectURL(url);
      activeUrls.clear();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const invalidate = () => { operation.current.version++; setPlan(null); setBusy(false); setMessage(''); };
  const live = plan?.isLive();
  const layer = photoSession.getLayer(layerId);
  return <dialog ref={ref} className="photo-export-dialog" aria-labelledby="photo-export-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-export-title">Eksperimentell fotoeksport</h2><button type="button" className={control} onClick={onClose}>Lukk eksport</button></header>
    <p>Gemini-kompatibilitet er ikke verifisert for noen av profilene. Pakken er til lokal importtesting.</p>
    <p>Hele FOTO-laget: {layer?.name || 'Laget er fjernet'}. Eksperimentell forekomstbevarende mapping: én godtatt forekomst blir én Skråfoto-feature. Flere features kan dele én originalfil. Ingen kameraposisjon utledes.</p>
    <label>Profil<select aria-label="Eksportprofil" value={profile} onChange={(event) => { invalidate(); setProfile(event.target.value); }}>
      <option value="">Velg profil</option>{Object.entries(PHOTO_EXPORT_PROFILES).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
    </select></label>
    <label>Koordinatsystem<select aria-label="Eksport-CRS" value={crs} onChange={(event) => { invalidate(); setCrs(event.target.value); }}><option>EPSG:25832</option><option>EPSG:25833</option></select></label>
    {profile === 'legacy2019' && <p>Legacy krever godtatt opptakstid med sekunder og godtatt retning. Ukjent retning er ikke nord.</p>}
    {profile === 'asbuilt52' && <fieldset><legend>Påkrevd AsBuilt-eksportkontekst</legend>
      <p>Oppgi sannferdige verdier for alle eksporterte forekomster. Dette fylles ikke fra bildet eller GMI. Eksperimentell 2D-geometri uten Z. Fotograf utelates fordi komplett moderne bildeinformasjon mangler.</p>
      {EXPORT_CONTEXT_FIELDS.map(({ key, label, type }) => <label key={key}>{label}{type === 'code'
        ? <select aria-label={`Eksport ${label}`} value={context[key] || ''} onChange={(event) => { invalidate(); setContext({ ...context, [key]: event.target.value }); }}>
          <option value="">Velg kode</option>{ASBUILT_CODES[key].map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}
        </select>
        : <input type={type} aria-label={`Eksport ${label}`} value={context[key] || ''} onChange={(event) => { invalidate(); setContext({ ...context, [key]: event.target.value }); }} />}</label>)}
    </fieldset>}
    <p>Attachments/&lt;filnavn&gt; med skråstrek er appens testkonvensjon. Retning antas eksperimentelt å være grader med klokken fra geografisk nord (1/1).</p>
    <PhotoEvidenceActions photos={photoSession.getLayerPhotos(layerId)} layerId={layerId} onAdopt={invalidate} />
    <button className={control} type="button" disabled={!profile || !layer || busy} onClick={async () => {
      const token = ++operation.current.version; setBusy(true); setPlan(null); setMessage('Bygger forhåndsvisning …');
      try {
        const next = await buildPhotoExportPlan(capturePhotoExportSnapshot(photoSession, layerId), { profile, crs, context });
        if (token === operation.current.version) { setPlan(next); setMessage(''); }
      } catch (error) { if (token === operation.current.version) setMessage(error.message); }
      finally { if (token === operation.current.version) setBusy(false); }
    }}>Lag eksportforhåndsvisning</button>
    {plan && <section aria-label="Eksportforhåndsvisning">
      <p>{plan.counts.uniqueImages} unike bilder i laget · {plan.counts.totalOccurrences} forekomster · {plan.counts.placed} plassert · {plan.counts.excluded} utelatt/uplassert</p>
      <p>{plan.counts.features} planlagte features · {plan.counts.attachments} vedlegg · {plan.counts.sharedAttachments} delte originalbilder</p>
      {!live && <p role="alert">Fotolaget eller godtatte data er endret. Lag en ny forhåndsvisning.</p>}
      <h3>Blokkerende feil ({plan.errors.length})</h3><Diagnostics items={plan.errors} />
      <h3>Advarsler ({plan.warnings.length})</h3><Diagnostics items={plan.warnings} />
      <details><summary>Vedleggsnavn og endringer</summary><ul>{plan.assets.map((asset) => <li key={asset.assetId}>{asset.originalFilename} → {asset.exportFilename}</li>)}</ul></details>
      <button className={control} type="button" disabled={busy || !live || Boolean(plan.errors.length)} onClick={async () => {
        const token = ++operation.current.version; setBusy(true); setMessage('Lager ZIP …');
        try {
          const blob = await buildPhotoExportPackage(plan);
          if (token !== operation.current.version) return;
          if (!plan.isLive()) throw new Error('Eksportplanen er utdatert. Lag en ny forhåndsvisning.');
          const url = URL.createObjectURL(blob); urls.current.add(url);
          const a = document.createElement('a'); a.href = url; a.download = `photos-${profile}-${crs.slice(5)}.zip`;
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000);
          setMessage('ZIP-pakken er klar for lokal Gemini-testing. Importresultat er ikke verifisert.');
        } catch (error) { if (token === operation.current.version) setMessage(error.message); }
        finally { if (token === operation.current.version) setBusy(false); }
      }}>Last ned testpakke</button>
    </section>}
    {message && <p role="status">{message}</p>}
  </dialog>;
}
