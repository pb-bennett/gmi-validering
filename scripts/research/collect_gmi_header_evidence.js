#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (values) => [...new Set(values)].sort(compareText);
const comparisonKey = (value) => String(value || '').trim().toUpperCase();

const TEMA_CANDIDATES = [
  'Tema',
  'TEMA',
  'PTEMA',
  'LTEMA',
  '.P_TEMA',
  '.L_TEMA',
  'S_FCODE',
  'FCODE',
];
const H_CANDIDATES = [
  'Nøyaktighet',
  'NOYAKTIGHET',
  'MålemetodeHøyde',
  'MALEMETODEHOYDE',
  'NøyaktighetHøyde',
  'NOYAKTIGHETHOYDE',
  'H_MÅLEMETODE',
  'H_MALEMETODE',
  'H_NOYAKTIGHET',
];
const DIMENSION_CANDIDATES = [
  'Bredde',
  'BREDDE',
  'Dimensjon',
  'DIMENSJON',
  'DIM',
  'DIAMETER',
];
const HYDRAULIC_FIELD_CANDIDATES = [
  'SDR',
  'Ringstivhet',
  'RINGSTIVHET',
  'SN',
  'Trykklasse',
  'TRYKKLASSE',
  'TRYKKKLASSE',
  'PN',
  'Nett_type',
  'NETT_TYPE',
  'NETTTYPE',
  'Material',
  'MATERIALE',
  'MATR',
];
const SUFFIX_CANDIDATES = [
  'InnvendigUtvendig_punkt',
  'InnvendigUtvendig_led',
  'Tykkelse_punkt',
  'Tykkelse_led',
  'Tema_punkt',
  'Tema_led',
  'NOBB-VAVVS-nr_punkt',
  'NOBB-VAVVS-nr_led',
  'S_HYPERLINK_punkt',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

async function discoverGmiFiles(rootDirectory) {
  const discovered = [];

  async function visit(directory) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gmi')) {
        discovered.push(entryPath);
      }
    }
  }

  await visit(rootDirectory);
  return discovered.sort(compareText);
}

function decodeHeaderLiteral(value) {
  const latinBytes = Buffer.from(value, 'latin1');
  const utf8Candidate = latinBytes.toString('utf8');
  if (
    !utf8Candidate.includes('\uFFFD') &&
    Buffer.from(utf8Candidate, 'utf8').equals(latinBytes)
  ) {
    return utf8Candidate;
  }
  return value;
}

function parseFieldNames(line) {
  const payload = line.slice('_FIELDNAMES'.length).trim();
  if (!payload) return [];
  return uniqueSorted(
    payload
      .split(';')
      .map((name) => decodeHeaderLiteral(name.trim()))
      .filter(Boolean)
  );
}

async function inspectGmiStructure(filePath) {
  const pointHeaders = new Set();
  const lineHeaders = new Set();
  const exportVersions = new Set();
  let context = null;
  let definitionCount = 0;
  let sawSignature = false;

  // Latin-1 is byte-preserving. Individual header names are then decoded as
  // UTF-8 only when the byte sequence round-trips without replacement.
  const input = fs.createReadStream(filePath, { encoding: 'latin1' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const rawLine of lines) {
    const line = String(rawLine)
      .replace(/^\u00EF\u00BB\u00BF/, '')
      .trim();
    if (!line) continue;

    if (line === '[GMIFILE_ASCII]') {
      sawSignature = true;
      context = null;
      continue;
    }

    const versionMatch = line.match(/^_?VERSION\s+([0-9]+(?:\.[0-9]+)*)$/i);
    if (versionMatch) exportVersions.add(versionMatch[1]);

    if (line.startsWith('[P_]')) {
      context = 'point';
      continue;
    }
    if (line.startsWith('[L_]')) {
      context = 'line';
      continue;
    }
    if (line.startsWith('[')) {
      context = null;
      continue;
    }

    if (context && line.startsWith('_FIELDNAMES')) {
      const headers = parseFieldNames(line);
      const target = context === 'point' ? pointHeaders : lineHeaders;
      headers.forEach((header) => target.add(header));
      definitionCount += 1;
    }
  }

  return {
    valid: sawSignature && definitionCount > 0,
    pointHeaders: uniqueSorted(pointHeaders),
    lineHeaders: uniqueSorted(lineHeaders),
    exportVersions: uniqueSorted(exportVersions),
  };
}

function addHeaderObservation(headerMap, literal, context) {
  let record = headerMap.get(literal);
  if (!record) {
    record = {
      literal,
      comparisonKey: comparisonKey(literal),
      pointFileCount: 0,
      lineFileCount: 0,
      fileObservationCount: 0,
      contextObservationCount: 0,
    };
    headerMap.set(literal, record);
  }
  if (context === 'point') record.pointFileCount += 1;
  if (context === 'line') record.lineFileCount += 1;
  record.contextObservationCount += 1;
}

function finalizeHeaderRecords(headerMap) {
  return [...headerMap.values()]
    .map((record) => ({
      literal: record.literal,
      comparisonKey: record.comparisonKey,
      observedContexts: [
        ...(record.pointFileCount > 0 ? ['point'] : []),
        ...(record.lineFileCount > 0 ? ['line'] : []),
      ],
      observationCount: record.contextObservationCount,
      fileObservationCount: record.fileObservationCount,
      pointFileCount: record.pointFileCount,
      lineFileCount: record.lineFileCount,
    }))
    .sort((a, b) => compareText(a.literal, b.literal));
}

function candidateEvidence(candidate, headers) {
  const key = comparisonKey(candidate);
  const matching = headers.filter((header) => header.comparisonKey === key);
  return {
    candidate,
    exactObserved: matching.some((header) => header.literal === candidate),
    caseInsensitiveObserved: matching.length > 0,
    literalSpellings: matching.map((header) => header.literal),
    observedContexts: uniqueSorted(matching.flatMap((header) => header.observedContexts)),
    observationCount: matching.reduce((sum, header) => sum + header.observationCount, 0),
    pointFileCount: matching.reduce((sum, header) => sum + header.pointFileCount, 0),
    lineFileCount: matching.reduce((sum, header) => sum + header.lineFileCount, 0),
  };
}

function buildSchemaCandidateGroups(schemaGroups, candidates) {
  const keys = new Set(candidates.map(comparisonKey));
  return schemaGroups
    .map((schema) => {
      const pointCandidates = uniqueSorted(
        schema.pointHeaders
          .filter((header) => keys.has(comparisonKey(header)))
      );
      const lineCandidates = uniqueSorted(
        schema.lineHeaders
          .filter((header) => keys.has(comparisonKey(header)))
      );
      return {
        schemaId: schema.schemaId,
        fileCount: schema.fileCount,
        pointCandidates,
        lineCandidates,
      };
    })
    .filter((entry) => entry.pointCandidates.length > 0 || entry.lineCandidates.length > 0);
}

function buildCanonicalFieldEvidence(census, headers, filesParsed) {
  if (!census || !Array.isArray(census.fields)) return [];
  const groups = new Map();
  for (const field of census.fields) {
    const id = field.recommendedV2CanonicalId;
    if (!groups.has(id)) {
      groups.set(id, {
        canonicalId: id,
        sourceProperties: new Set(),
        legacyFieldKeys: new Set(),
        scope: new Set(),
        legacyAliases: new Set(),
      });
    }
    const group = groups.get(id);
    group.sourceProperties.add(field.sourceProperty);
    (field.legacyFieldKeys || []).forEach((key) => group.legacyFieldKeys.add(key));
    (field.scope || []).forEach((scope) => group.scope.add(scope));
    (field.legacyAliases || []).forEach((alias) => group.legacyAliases.add(alias));
  }

  return [...groups.values()]
    .map((group) => {
      const sourceProperties = uniqueSorted(group.sourceProperties);
      const candidateNames = uniqueSorted([...sourceProperties, ...group.legacyAliases]);
      const matching = headers.filter((header) =>
        candidateNames.some((candidate) => comparisonKey(candidate) === header.comparisonKey)
      );
      const directMatching = headers.filter((header) =>
        sourceProperties.some((sourceProperty) => comparisonKey(sourceProperty) === header.comparisonKey)
      );
      const exactDirectMatching = directMatching.filter((header) =>
        sourceProperties.includes(header.literal)
      );
      const nonDirectAliases = [...group.legacyAliases].filter(
        (alias) => !sourceProperties.includes(alias)
      );
      const observedAliases = nonDirectAliases.filter((alias) =>
        headers.some((header) => header.comparisonKey === comparisonKey(alias))
      );
      const contexts = uniqueSorted(matching.flatMap((header) => header.observedContexts));
      return {
        canonicalId: group.canonicalId,
        sourceProperty: sourceProperties.length === 1 ? sourceProperties[0] : sourceProperties,
        expectedDirectGmiProperty: sourceProperties.length === 1 ? sourceProperties[0] : sourceProperties,
        legacyFieldKeys: uniqueSorted(group.legacyFieldKeys),
        scope: uniqueSorted(group.scope),
        literalObservedHeaderSpellings: matching.map((header) => header.literal),
        directSourcePropertyLiteralSpellings: directMatching.map((header) => header.literal),
        observedPointContext: filesParsed === 0 ? 'unresolved' : contexts.includes('point') ? 'yes' : 'no',
        observedLineContext: filesParsed === 0 ? 'unresolved' : contexts.includes('line') ? 'yes' : 'no',
        observationStatus: filesParsed === 0 ? 'UNRESOLVED' : matching.length > 0 ? 'OBSERVED' : 'NOT_OBSERVED_IN_SAMPLE',
        directSourceBackedMappingSupportedByCorpus: exactDirectMatching.length > 0,
        observedLegacyAliases: uniqueSorted(observedAliases),
        legacyAliasObserved: observedAliases.length > 0,
        semanticConfirmationStillRequired: observedAliases.length > 0,
      };
    })
    .sort((a, b) => compareText(a.canonicalId, b.canonicalId));
}

function buildAliasEvidence(census, headers) {
  if (!census || !Array.isArray(census.aliasAudit)) return [];
  return census.aliasAudit
    .flatMap((group) =>
      (group.candidates || []).map((alias) => ({
        logicalKey: group.logicalKey,
        alias,
        classification: group.classification,
        safety: group.safety,
        ...candidateEvidence(alias, headers),
        semanticAuthority: group.safety === 'SAFE' ? 'safe as configured' : 'requires separate confirmation',
      }))
    )
    .sort((a, b) => compareText(`${a.logicalKey}\u0000${a.alias}`, `${b.logicalKey}\u0000${b.alias}`));
}

function buildSuffixEvidence(headers) {
  const configured = SUFFIX_CANDIDATES.map((candidate) => candidateEvidence(candidate, headers));
  const anySuffixedHeaders = headers
    .filter((header) => /_(?:punkt|led)/i.test(header.literal))
    .map((header) => ({
      literal: header.literal,
      observedContexts: header.observedContexts,
      observationCount: header.observationCount,
    }));
  return { configured, anySuffixedHeaders };
}

function buildTemaEvidence(headers, schemaGroups, filesParsed) {
  const candidates = TEMA_CANDIDATES.map((candidate) => {
    const evidence = candidateEvidence(candidate, headers);
    const isDottedGeometryCandidate = candidate === '.P_TEMA' || candidate === '.L_TEMA';
    let candidateClassification = 'TEMA_FAMILY_CANDIDATE';
    let semanticAuthority = 'UNRESOLVED';

    if (candidate === 'Tema') {
      candidateClassification = 'DIRECT_SOURCE_PROPERTY';
      semanticAuthority = evidence.exactObserved
        ? 'SOURCE_BACKED_WHEN_EXACTLY_DELIVERED'
        : 'UNRESOLVED';
    } else if (candidate === 'S_FCODE') {
      candidateClassification = 'PRACTICAL_GMI_IDENTITY_CANDIDATE';
    } else if (isDottedGeometryCandidate) {
      candidateClassification = 'NONCANONICAL_LEGACY_FORMAT_LIKE_TEMA_CANDIDATE';
    }

    return {
      ...evidence,
      observationStatus: evidence.exactObserved
        ? 'OBSERVED'
        : evidence.caseInsensitiveObserved
          ? 'OBSERVED_CASE_VARIANT'
          : 'NOT_OBSERVED_IN_SAMPLE',
      candidateClassification,
      semanticAuthority,
    };
  });
  const coexistence = buildSchemaCandidateGroups(schemaGroups, TEMA_CANDIDATES).filter(
    (entry) => uniqueSorted([...entry.pointCandidates, ...entry.lineCandidates]).length > 1
  );
  const identityKeys = new Set(TEMA_CANDIDATES.map(comparisonKey));
  let pointSchemaFileCount = 0;
  let lineSchemaFileCount = 0;
  let pointIdentityFileCount = 0;
  let lineIdentityFileCount = 0;
  for (const schema of schemaGroups) {
    if (schema.pointHeaders.length > 0) {
      pointSchemaFileCount += schema.fileCount;
      if (schema.pointHeaders.some((header) => identityKeys.has(comparisonKey(header)))) {
        pointIdentityFileCount += schema.fileCount;
      }
    }
    if (schema.lineHeaders.length > 0) {
      lineSchemaFileCount += schema.fileCount;
      if (schema.lineHeaders.some((header) => identityKeys.has(comparisonKey(header)))) {
        lineIdentityFileCount += schema.fileCount;
      }
    }
  }
  return {
    candidates,
    schemaCoexistence: coexistence,
    structuralCoverage: {
      filesParsed,
      pointSchemaFileCount,
      pointIdentityFileCount,
      lineSchemaFileCount,
      lineIdentityFileCount,
    },
    authorityConclusion: 'Header occurrence is format evidence only. .P_TEMA and .L_TEMA are observed noncanonical, legacy-format-like candidates with UNRESOLVED semantic authority; they must not be mapped to Innmålingsinstruks Tema without separate proof.',
  };
}

async function collectGmiHeaderEvidence(rootDirectory, options = {}) {
  const corpusLabel = options.corpusLabel || 'local-reference-corpus';
  const census = options.census || null;
  const files = await discoverGmiFiles(rootDirectory);
  const headerMap = new Map();
  const schemas = new Map();
  const exportVersions = new Map();
  let filesParsed = 0;
  let filesFailed = 0;

  for (const filePath of files) {
    try {
      const structure = await inspectGmiStructure(filePath);
      if (!structure.valid) {
        filesFailed += 1;
        continue;
      }
      filesParsed += 1;
      for (const header of structure.pointHeaders) addHeaderObservation(headerMap, header, 'point');
      for (const header of structure.lineHeaders) addHeaderObservation(headerMap, header, 'line');
      for (const header of new Set([...structure.pointHeaders, ...structure.lineHeaders])) {
        headerMap.get(header).fileObservationCount += 1;
      }
      for (const version of structure.exportVersions) {
        exportVersions.set(version, (exportVersions.get(version) || 0) + 1);
      }

      const schemaShape = {
        pointHeaders: structure.pointHeaders,
        lineHeaders: structure.lineHeaders,
      };
      const schemaKey = JSON.stringify(schemaShape);
      if (!schemas.has(schemaKey)) schemas.set(schemaKey, { ...schemaShape, fileCount: 0 });
      schemas.get(schemaKey).fileCount += 1;
    } catch {
      filesFailed += 1;
    }
  }

  const headers = finalizeHeaderRecords(headerMap);
  const schemaGroups = [...schemas.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, schema], index) => ({
      schemaId: `schema-${String(index + 1).padStart(3, '0')}`,
      fileCount: schema.fileCount,
      geometryContexts: [
        ...(schema.pointHeaders.length > 0 ? ['point'] : []),
        ...(schema.lineHeaders.length > 0 ? ['line'] : []),
      ],
      headers: uniqueSorted([...schema.pointHeaders, ...schema.lineHeaders]),
      pointHeaders: schema.pointHeaders,
      lineHeaders: schema.lineHeaders,
    }));

  return {
    schemaVersion: '1.0.0',
    generatedAt: options.generatedAt || new Date().toISOString().slice(0, 10),
    purpose: 'Privacy-safe aggregate structural evidence for literal GMI field headers. No source identities, values, objects, or geometry are retained.',
    corpus: {
      label: corpusLabel,
      filesScanned: files.length,
      filesParsed,
      filesFailed,
      exportVersions: [...exportVersions.entries()]
        .sort(([left], [right]) => compareText(left, right))
        .map(([version, fileCount]) => ({ version, fileCount })),
    },
    headers,
    schemaGroups,
    canonicalFieldEvidence: buildCanonicalFieldEvidence(census, headers, filesParsed),
    temaEvidence: buildTemaEvidence(headers, schemaGroups, filesParsed),
    hFieldEvidence: {
      candidates: H_CANDIDATES.map((candidate) => candidateEvidence(candidate, headers)),
      schemaCoexistence: buildSchemaCandidateGroups(schemaGroups, H_CANDIDATES),
    },
    dimensionEvidence: {
      candidates: DIMENSION_CANDIDATES.map((candidate) => candidateEvidence(candidate, headers)),
      schemaCoexistence: buildSchemaCandidateGroups(schemaGroups, DIMENSION_CANDIDATES),
    },
    hydraulicFieldHeaderEvidence: {
      candidates: HYDRAULIC_FIELD_CANDIDATES.map((candidate) => candidateEvidence(candidate, headers)),
      schemaCoexistence: buildSchemaCandidateGroups(schemaGroups, HYDRAULIC_FIELD_CANDIDATES),
      note: 'Presence is structural evidence only and is not used to classify any object.',
    },
    suffixEvidence: buildSuffixEvidence(headers),
    aliasEvidence: buildAliasEvidence(census, headers),
    privacyChecks: {
      syntheticLeakTestPassed: false,
      filenamesRetained: false,
      pathsRetained: false,
      attributeValuesRetained: false,
      coordinatesRetained: false,
      objectIdsRetained: false,
      perFileRecordsRetained: false,
    },
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root || !args.output) {
    process.stderr.write('Collector failed: required arguments are missing.\n');
    process.exitCode = 2;
    return;
  }

  try {
    const census = args.census
      ? JSON.parse(await fs.promises.readFile(args.census, 'utf8'))
      : null;
    const evidence = await collectGmiHeaderEvidence(args.root, {
      census,
      corpusLabel: args['corpus-label'] || 'local-reference-corpus',
      generatedAt: args['generated-at'],
    });
    await fs.promises.mkdir(path.dirname(args.output), { recursive: true });
    await fs.promises.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `GMI header evidence collected: scanned=${evidence.corpus.filesScanned} parsed=${evidence.corpus.filesParsed} failed=${evidence.corpus.filesFailed} schemas=${evidence.schemaGroups.length}\n`
    );
  } catch {
    process.stderr.write('Collector failed with a generic processing error.\n');
    process.exitCode = 1;
  }
}

module.exports = {
  buildTemaEvidence,
  collectGmiHeaderEvidence,
  inspectGmiStructure,
  parseFieldNames,
};

if (require.main === module) {
  runCli();
}
