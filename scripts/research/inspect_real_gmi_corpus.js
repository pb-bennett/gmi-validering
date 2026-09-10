#!/usr/bin/env node
'use strict';

// Local-only corpus inspector. It deliberately retains source paths only in the
// caller-selected local manifest; its aggregate has no per-file identities.
const fs = require('fs');
const path = require('path');

const compare = (a, b) => String(a).localeCompare(String(b), 'en');
const key = (value) => String(value ?? '').trim().toUpperCase();
const direct = [
  'Anleggsår','Datafangstdato','Innmålt_av','Saksnummer','Høydereferanse','Målemetode','Nøyaktighet','MålemetodeHøyde','NøyaktighetHøyde','Stedfestingsforhold','Stedfestingsårsak','Synbarhet','Merknad','Eier','Vertikalnivå','MaksAvvikVertikalt','MaksAvvikHorisontalt','Tema','S_FCODE','Type','Kumform','Bredde','Lengde','InnvendigUtvendig','Tykkelse','Utvendig_høyde','Avst_BunnInnvUnderUtv','Byggemetode','Adkomst','Kjegle','AnleggsID','S_HYPERLINK','NOBB-VAVVS-nr','NOBB-VAVVS-nr-ramme','Nett_type','Material','Dimensjon','VertikalDimensjon','Rørform','SDR','Ringstivhet','Trykklasse'
];
const fields = new Map(direct.map((name) => [key(name), name]));
const knownMaterials = new Set('AAS ABS AN ATF BET FJE GRP GSE GUP ICO KISVEIT KOMPOS LER MCU MGA MRS MSF MST PE PE32 PE50 PE80 PE100 PE100-RC-PP0 PEH PEH_PEM PEL PEM PERC PLAST PP PVC PVC-O PVC-U RDEL SJ SJG SJK STA STF STG TEG TNA TRE UK'.split(' '));
const plastic = new Set('ABS GRP GSE GUP PE PE32 PE50 PE80 PE100 PE100-RC-PP0 PEH PEH_PEM PEL PEM PERC PLAST PP PVC PVC-O PVC-U'.split(' '));
const sdrPlastic = new Set('PE PE32 PE50 PE80 PE100 PE100-RC-PP0 PEH PEH_PEM PEL PEM PERC PVC PVC-O PVC-U'.split(' '));
const pressure = (tema) => /^VL/.test(tema) || ['AFP','I2P','OVP','SPP'].includes(tema);
const suction = (tema) => ['AFS','I2S','SPS'].includes(tema);
const gravity = (tema) => /^(AF|OV|SP|SL|DR|ST)/.test(tema) && !pressure(tema) && !suction(tema);

async function findGmi(root) {
  const found = [];
  async function visit(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && /\.gmi$/i.test(entry.name)) found.push(full);
    }
  }
  await visit(root); return found.sort(compare);
}

function decoded(line) {
  const bytes = Buffer.from(line, 'latin1'); const utf8 = bytes.toString('utf8');
  return !utf8.includes('\ufffd') && Buffer.from(utf8, 'utf8').equals(bytes) ? utf8 : line;
}
function names(line) { return line.slice('_FIELDNAMES'.length).trim().split(';').map((v) => decoded(v.trim())); }
function emptyRecord(filePath, corpus, stat) {
  return { sourcePath: filePath, corpus, modifiedYear: stat.mtime.getUTCFullYear(), pointObjects: 0, lineObjects: 0, pointHeaders: [], lineHeaders: [], scenarios: new Set(), values: new Map(), parseState: 'OK' };
}
function observe(record, geometry, headerNames, raw) {
  const vals = raw.slice('_FIELDVALUES'.length).replace(/^[ \t]/, '').split(';');
  const attrs = new Map();
  headerNames.forEach((header, i) => {
    const canonical = fields.get(key(header)); if (!canonical) return;
    const value = (vals[i] ?? '').trim(); attrs.set(canonical, value);
    if (value) { if (!record.values.has(canonical)) record.values.set(canonical, new Set()); record.values.get(canonical).add(value); }
  });
  const tema = key(attrs.get('Tema') || attrs.get('S_FCODE'));
  const temaDirect = key(attrs.get('Tema')); const fcode = key(attrs.get('S_FCODE'));
  if (temaDirect && fcode) record.scenarios.add(temaDirect === fcode ? 'tema_both_agree' : 'tema_both_disagree');
  else if (temaDirect) record.scenarios.add('tema_only'); else if (fcode) record.scenarios.add('sfcode_only'); else record.scenarios.add('tema_neither');
  const add = (id, condition) => { if (condition) record.scenarios.add(id); };
  const anlegg = attrs.get('Anleggsår') || ''; const date = attrs.get('Datafangstdato') || ''; const reason = key(attrs.get('Stedfestingsårsak'));
  add('nytt_missing_year', reason === 'NYTT' && !anlegg); add('nytt_old_year', reason === 'NYTT' && /^\d{4}$/.test(anlegg) && Number(anlegg) < new Date().getFullYear() - 5);
  add('nonnytt_missing_year', reason && reason !== 'NYTT' && !anlegg); add('date_old', /^\d\d\.\d\d\.\d{4}$/.test(date) && Number(date.slice(-4)) < new Date().getFullYear() - 5); add('date_before_year', /^\d{4}$/.test(anlegg) && /^\d\d\.\d\d\.\d{4}$/.test(date) && Number(date.slice(-4)) < Number(anlegg));
  add('measure_96', attrs.get('Målemetode') === '96'); add('measure_97', attrs.get('Målemetode') === '97'); add('accuracy_zero', attrs.get('Nøyaktighet') === '0'); add('height_accuracy_zero', attrs.get('NøyaktighetHøyde') === '0');
  ['Kumform','Bredde','Tykkelse','Avst_BunnInnvUnderUtv','Byggemetode','Kjegle','Adkomst','Lengde','Utvendig_høyde','AnleggsID','S_HYPERLINK','NOBB-VAVVS-nr','NOBB-VAVVS-nr-ramme'].forEach((f) => add(`has_${f}`, Boolean(attrs.get(f))));
  if (geometry === 'line') {
    const material = key(attrs.get('Material')); const form = key(attrs.get('Rørform')); const sdr = attrs.get('SDR'); const sn = attrs.get('Ringstivhet'); const pn = attrs.get('Trykklasse');
    add(`material_${material || 'missing'}`, Boolean(material)); add(`form_${form || 'missing'}`, Boolean(form)); add('small_dimension', /^\d+$/.test(attrs.get('Dimensjon') || '') && Number(attrs.get('Dimensjon')) < 32);
    add('non_s_with_vertical', form && form !== 'S' && Boolean(attrs.get('VertikalDimensjon'))); add('non_s_missing_vertical', form && form !== 'S' && !attrs.get('VertikalDimensjon')); add('s_with_vertical', form === 'S' && Boolean(attrs.get('VertikalDimensjon')));
    const cls = pressure(tema) ? 'pressure' : suction(tema) ? 'suction' : gravity(tema) ? 'gravity' : 'special'; add(`hydraulic_${cls}_${plastic.has(material) ? 'plastic' : 'nonplastic'}`, Boolean(tema && material));
    add('pressure_plastic_sdr', cls === 'pressure' && sdrPlastic.has(material) && Boolean(sdr)); add('pressure_plastic_missing_sdr', cls === 'pressure' && sdrPlastic.has(material) && !sdr); add('nonpressure_sdr', cls !== 'pressure' && Boolean(sdr));
    add('gravity_plastic_sn', cls === 'gravity' && plastic.has(material) && Boolean(sn)); add('gravity_plastic_missing_sn', cls === 'gravity' && plastic.has(material) && !sn); add('pressure_sn', cls === 'pressure' && Boolean(sn)); add('nonplastic_sn', !plastic.has(material) && Boolean(sn));
    add('pressure_pn', cls === 'pressure' && Boolean(pn)); add('pressure_missing_pn', cls === 'pressure' && !pn); add('nonpressure_pn', cls !== 'pressure' && Boolean(pn));
    add('material_invalid', Boolean(material) && !knownMaterials.has(material));
  }
}
async function inspectFile(filePath, corpus) {
  const stat = await fs.promises.stat(filePath); const text = await fs.promises.readFile(filePath, 'latin1'); const r = emptyRecord(filePath, corpus, stat);
  const lines = text.split(/\r?\n/); if (!lines[0]?.trim().startsWith('[GMIFILE_ASCII]')) { r.parseState = 'BROKEN_PARSE'; return r; }
  let geometry = null; let pointNames = []; let lineNames = [];
  for (const raw of lines) { const line = raw.trim(); if (line === '[P_]') { geometry = 'point'; continue; } if (line === '[L_]') { geometry = 'line'; continue; } if (line.startsWith('[+P_]')) { geometry = 'point-data'; continue; } if (line.startsWith('[+L_]')) { geometry = 'line-data'; continue; } if (line.startsWith('[')) { geometry = null; continue; }
    if (geometry === 'point' && line.startsWith('_FIELDNAMES')) { pointNames = names(line); r.pointHeaders = pointNames.filter((v) => fields.has(key(v))); }
    if (geometry === 'line' && line.startsWith('_FIELDNAMES')) { lineNames = names(line); r.lineHeaders = lineNames.filter((v) => fields.has(key(v))); }
    if (geometry === 'point-data' && line.startsWith(':P ')) r.pointObjects += 1; if (geometry === 'line-data' && line.startsWith(':L ')) r.lineObjects += 1;
    if (geometry === 'point-data' && line.startsWith('_FIELDVALUES')) observe(r, 'point', pointNames, line); if (geometry === 'line-data' && line.startsWith('_FIELDVALUES')) observe(r, 'line', lineNames, line);
  }
  if (!r.pointHeaders.length && !r.lineHeaders.length) r.parseState = 'BROKEN_PARSE'; return r;
}
function quality(r) {
  if (r.parseState !== 'OK') return 'BROKEN_PARSE'; const total = r.pointObjects + r.lineObjects; const headers = r.pointHeaders.length + r.lineHeaders.length; const defects = ['tema_neither','material_invalid','nytt_missing_year','date_before_year','non_s_missing_vertical'].filter((x) => r.scenarios.has(x)).length;
  if (total === 0 || headers <= 7 || defects >= 3) return 'VERY_BAD'; if (r.modifiedYear <= 2022 || headers < 25) return 'LEGACY_POOR'; if (r.modifiedYear >= 2024 && headers >= 50 && defects === 0) return 'GOOD_MODERN'; return 'USEFUL_EDGE_CASE';
}
function serial(r) { return { ...r, scenarios: [...r.scenarios].sort(compare), values: undefined, pointHeaders: [...r.pointHeaders].sort(compare), lineHeaders: [...r.lineHeaders].sort(compare), quality: quality(r) }; }
async function inspectCorpus({ fkRoot, hkRoot }) { const rows = []; for (const [root, corpus] of [[fkRoot,'FK'],[hkRoot,'HK']]) for (const file of await findGmi(root)) rows.push(await inspectFile(file, corpus)); return rows; }
function aggregate(rows) { const scenarios = {}; const qualityCounts = {}; const fieldsSeen = Object.fromEntries(direct.map((x) => [x, 0])); for (const r of rows) { qualityCounts[quality(r)] = (qualityCounts[quality(r)] || 0) + 1; for (const s of r.scenarios) scenarios[s] = (scenarios[s] || 0) + 1; for (const h of new Set([...r.pointHeaders, ...r.lineHeaders])) fieldsSeen[fields.get(key(h))] += 1; } return { filesScanned: rows.length, parsed: rows.filter((x) => x.parseState === 'OK').length, failed: rows.filter((x) => x.parseState !== 'OK').length, qualityCounts, scenarioFileCounts: Object.fromEntries(Object.entries(scenarios).sort(([a],[b]) => compare(a,b))), canonicalHeaderFileCounts: fieldsSeen }; }
function selectCases(rows) {
  const desired = [['GOOD_MODERN', 4, 'real-modern'], ['USEFUL_EDGE_CASE', 5, 'real-edge'], ['LEGACY_POOR', 5, 'real-legacy'], ['VERY_BAD', 3, 'real-verybad'], ['BROKEN_PARSE', 2, 'real-parser-broken']];
  const frequency = aggregate(rows).scenarioFileCounts; const covered = new Set(); const selected = [];
  for (const [category, limit, prefix] of desired) {
    const pool = rows.filter((r) => quality(r) === category);
    for (let ordinal = 1; ordinal <= limit && pool.length; ordinal += 1) {
      pool.sort((a, b) => {
        const score = (r) => [...r.scenarios].reduce((sum, s) => sum + (covered.has(s) ? 0 : 1 / frequency[s]), 0) + (r.pointObjects > 0 && r.lineObjects > 0 ? .2 : 0);
        return score(b) - score(a) || b.pointHeaders.length + b.lineHeaders.length - a.pointHeaders.length - a.lineHeaders.length || compare(a.sourcePath, b.sourcePath);
      });
      const chosen = pool.shift(); [...chosen.scenarios].forEach((s) => covered.add(s));
      selected.push({ testCaseId: `${prefix}-${String(ordinal).padStart(2,'0')}`, sourcePath: chosen.sourcePath, corpus: chosen.corpus, quality: category, modifiedYear: chosen.modifiedYear, geometry: chosen.pointObjects && chosen.lineObjects ? 'mixed' : chosen.pointObjects ? 'point' : chosen.lineObjects ? 'line' : 'none', reason: `Selected for diverse bounded validation scenarios: ${[...chosen.scenarios].sort(compare).slice(0,8).join(', ')}`, scenarios: [...chosen.scenarios].sort(compare) });
    }
  }
  return selected;
}
async function cli() { const [fkRoot,hkRoot,localOutput,aggregateOutput] = process.argv.slice(2); if (!aggregateOutput) throw new Error('usage: FK HK local-manifest aggregate-output'); const rows = await inspectCorpus({fkRoot,hkRoot}); await fs.promises.mkdir(path.dirname(localOutput),{recursive:true}); await fs.promises.writeFile(localOutput, JSON.stringify({purpose:'LOCAL ONLY: source identities for selected corpus cases', files:selectCases(rows)},null,2)+'\n'); await fs.promises.writeFile(aggregateOutput, JSON.stringify(aggregate(rows),null,2)+'\n'); process.stdout.write(`Corpus inspected: scanned=${rows.length} parsed=${rows.filter((x)=>x.parseState==='OK').length} failed=${rows.filter((x)=>x.parseState!=='OK').length}\n`); }
module.exports = { inspectCorpus, aggregate, quality, selectCases };
if (require.main === module) cli().catch(() => { process.stderr.write('Corpus inspector failed.\n'); process.exitCode=1; });
