import fieldsData from '@/data/fields.json';

// Define aliases for fields that might have different names in the source data
const FIELD_ALIASES = {
  Tema_punkt: ['S_FCODE', 'Tema', 'TEMA', 'FCODE'],
  Tema_led: ['S_FCODE', 'Tema', 'TEMA', 'FCODE'],
  Høydereferanse: ['Høydereferanse', 'HOYDEREFERANSE', 'HREF'],
  Målemetode: ['Målemetode', 'MALEMETODE', 'METODE'],
  Nøyaktighet: [
    'Nøyaktighet',
    'NOYAKTIGHET',
    'H_MÅLEMETODE',
    'H_NOYAKTIGHET',
  ],
  Dato: ['Dato', 'DATO', 'DATOREG', 'REGDATO'],
  Trykklasse: ['Trykklasse', 'TRYKKLASSE', 'PN', 'TRYKKKLASSE'],
  Ringstivhet: ['Ringstivhet', 'RINGSTIVHET', 'SN'],
  SDR: ['SDR'],
  Nett_type: ['Nett_type', 'NETT_TYPE', 'NETTTYPE'],
  Material: ['Material', 'MATERIALE', 'MATR'],
  'Bredde (diameter)': [
    'Bredde',
    'BREDDE',
    'DIAMETER',
    'DIMENSJON',
    'DIM',
  ],
};

export function validateFields(data) {
  if (!data) return [];

  const { points, lines } = data;
  const results = [];

  // Helper to get value checking aliases and case-insensitivity
  const getValue = (feature, fieldKey) => {
    const attrs = feature.attributes;
    if (!attrs) return undefined;

    // 1. Try exact match
    if (attrs[fieldKey] !== undefined) return attrs[fieldKey];

    // 2. Try aliases
    const aliases = FIELD_ALIASES[fieldKey];
    if (aliases) {
      for (const alias of aliases) {
        if (attrs[alias] !== undefined) return attrs[alias];
      }
    }

    // 3. Try case-insensitive match (generic fallback)
    const lowerKey = fieldKey.toLowerCase();
    const foundKey = Object.keys(attrs).find(
      (k) => k.toLowerCase() === lowerKey
    );
    if (foundKey) return attrs[foundKey];

    return undefined;
  };

  // Helper to determine pipe type (gravity vs pressure)
  const getPipeType = (feature) => {
    // Check Tema/S_FCODE
    const fcode =
      getValue(feature, 'Tema_led') ||
      getValue(feature, 'Tema_punkt') ||
      '';
    // Check Nett_type
    const nettType = getValue(feature, 'Nett_type') || '';
    // Check Material
    const material = getValue(feature, 'Material') || '';

    const upperFcode = String(fcode).toUpperCase();
    const upperNettType = String(nettType).toUpperCase();
    const upperMaterial = String(material).toUpperCase();

    // Logic for Pressure pipes
    // VL = Vannledning (Water line) - usually pressure
    // Trykk = Pressure
    if (upperFcode.includes('VL') || upperFcode.includes('VANN'))
      return 'pressure';
    if (upperNettType.includes('TRYKK')) return 'pressure';

    // Check for pressure indicators in FCODE (e.g. SPTR, AFTR)
    if (upperFcode.includes('TR') && !upperFcode.includes('TRASÉ'))
      return 'pressure'; // Avoid false positives if any

    // Check Material
    // Removed generic PE check as PE is used for both gravity and pressure
    // if (upperMaterial.startsWith('PE')) return 'pressure';
    if (
      upperMaterial.includes('STÅL') ||
      upperMaterial.includes('MST') ||
      upperMaterial.includes('SJK')
    )
      return 'pressure';

    // Check if SDR or Trykklasse is present (if so, treat as pressure to validate it)
    const sdr = getValue(feature, 'SDR');
    const trykklasse = getValue(feature, 'Trykklasse');

    const hasSdr =
      sdr !== undefined && sdr !== null && String(sdr).trim() !== '';
    const hasTrykklasse =
      trykklasse !== undefined &&
      trykklasse !== null &&
      String(trykklasse).trim() !== '';

    if (hasSdr || hasTrykklasse) return 'pressure';

    // Default to gravity (Selvfall) for SP (Spillvann), OV (Overvann), AF (Avløp Felles)
    // unless explicitly marked as pressure in Nett_type
    return 'gravity';
  };

  // Helper to check if a value is valid based on acceptableValues
  const isValidValue = (value, acceptableValues) => {
    if (!acceptableValues || acceptableValues.length === 0)
      return true;
    
    // 1. Try exact string match (case-insensitive for robustness)
    const strValue = String(value).trim();
    if (acceptableValues.some((av) => String(av.value).trim() === strValue)) {
      return true;
    }

    // 2. Special handling for numeric values (e.g. SDR "11" vs "11.0")
    // If the value is numeric, try comparing it numerically against acceptable values
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return acceptableValues.some((av) => {
        const avNum = parseFloat(av.value);
        // Check if acceptable value is also a number and they are close enough
        return !isNaN(avNum) && Math.abs(avNum - numValue) < 0.0001;
      });
    }

    return false;
  };

  fieldsData.forEach((field) => {
    let totalApplicable = 0;
    let presentCount = 0;
    let validCount = 0;
    let missingCount = 0;
    let invalidCount = 0;
    let unexpectedCount = 0;
    const valueCounts = {};
    const failingIds = []; // IDs of features that fail validation (missing or invalid)

    // Helper to check if field is applicable for a specific feature
    const isApplicable = (feature) => {
      // 1. Basic object type check (handled by loop selection, but good to double check if mixed)
      // (The loops below already separate points and lines, so we assume the feature is of the correct geometry type)

      // 2. Conditional Logic for specific fields
      const pipeType = getPipeType(feature);
      const fcode = getValue(feature, 'Tema_punkt') || '';
      const upperFcode = String(fcode).toUpperCase();

      if (field.fieldKey === 'Ringstivhet') {
        // Only valid for Gravity pipes (Selvfall)
        return pipeType === 'gravity';
      }

      if (
        field.fieldKey === 'SDR' ||
        field.fieldKey === 'Trykklasse'
      ) {
        // Only valid for Pressure pipes (Trykk)
        return pipeType === 'pressure';
      }

      if (field.fieldKey === 'Bredde (diameter)' || field.fieldKey === 'Byggemetode') {
        // Required for KUM, LOK, SAN, SLS, SLU
        const requiredTypes = ['KUM', 'LOK', 'SAN', 'SLS', 'SLU'];
        return requiredTypes.some(type => upperFcode === type);
      }

      if (field.fieldKey === 'Kumform' || field.fieldKey === 'Kjegle') {
        // Required for KUM, SAN, SLS, SLU
        const requiredTypes = ['KUM', 'SAN', 'SLS', 'SLU'];
        return requiredTypes.some(type => upperFcode === type);
      }

      if (field.fieldKey === 'Type') {
        // Required for FORAKONSTR, DIV, GRØKONSTR
        const requiredTypes = ['FORAKONSTR', 'DIV', 'GRØKONSTR'];
        return requiredTypes.some(type => upperFcode === type);
      }

      return true;
    };

    const checkFeature = (feature, index, typePrefix) => {
      const applicable = isApplicable(feature);
      const value = getValue(feature, field.fieldKey);
      const hasValue =
        value !== undefined && value !== null && value !== '';

      if (applicable) {
        totalApplicable++;

        if (hasValue) {
          presentCount++;
          const strValue = String(value);
          valueCounts[strValue] = (valueCounts[strValue] || 0) + 1;

          if (isValidValue(value, field.acceptableValues)) {
            validCount++;
          } else {
            invalidCount++;
            failingIds.push(`${typePrefix}-${index}`);
          }
        } else {
          missingCount++;
          failingIds.push(`${typePrefix}-${index}`);
        }
      } else {
        // Not applicable
        if (hasValue) {
          unexpectedCount++;
          // We still track the value for the pivot table
          const strValue = String(value);
          valueCounts[strValue] = (valueCounts[strValue] || 0) + 1;
          // Unexpected values are also considered "failing" in a sense, but maybe we just want missing/invalid?
          // Let's include them for now so the user can see them.
          failingIds.push(`${typePrefix}-${index}`);
        }
      }
    };

    // Check points if applicable
    if (field.objectTypes.includes('punktobjekter')) {
      points.forEach((p, i) => checkFeature(p, i, 'punkter'));
    }

    // Check lines if applicable
    if (field.objectTypes.includes('ledninger')) {
      lines.forEach((l, i) => checkFeature(l, i, 'ledninger'));
    }

    // Determine status
    let status = 'ok';

    // Status Logic:
    // Error: Missing for ALL applicable features (0% completion)
    // Warning: Missing for SOME applicable features (<100% completion), OR invalid values, OR unexpected values
    // OK: 100% completion and valid (or not applicable)

    if (field.required === 'always') {
      if (presentCount === 0 && totalApplicable > 0) {
        status = 'error'; // Missing entirely
      } else if (missingCount > 0 || invalidCount > 0) {
        status = 'warning'; // Partial or Invalid
      }
    } else if (field.required === 'conditional') {
      if (missingCount > 0) status = 'warning';
    }

    // Warning if unexpected values found (e.g. SDR on gravity pipe)
    if (unexpectedCount > 0) {
      // If it was OK, downgrade to warning. If it was Error, keep Error.
      if (status === 'ok') status = 'warning';
    }

    // Determine condition label for UI
    let conditionLabel = null;
    if (field.fieldKey === 'Ringstivhet') conditionLabel = 'Selvfall';
    else if (
      field.fieldKey === 'SDR' ||
      field.fieldKey === 'Trykklasse'
    )
      conditionLabel = 'Trykk';
    else if (field.fieldKey === 'Bredde (diameter)' || field.fieldKey === 'Byggemetode') conditionLabel = 'Kum/Lokk/Sluk';
    else if (field.fieldKey === 'Kumform' || field.fieldKey === 'Kjegle') conditionLabel = 'Kum/Sluk';
    else if (field.fieldKey === 'Type') conditionLabel = 'Div/Konstr';

    // Calculate completion percentage
    const completion =
      totalApplicable > 0
        ? (presentCount / totalApplicable) * 100
        : 0;

    results.push({
      ...field,
      conditionLabel,
      stats: {
        total: totalApplicable,
        present: presentCount,
        valid: validCount,
        missing: missingCount,
        invalid: invalidCount,
        unexpected: unexpectedCount,
        completion,
        valueCounts,
      },
      failingIds,
      status,
    });
  });

  // Sort results: Tema first, then Errors, then Warnings, then OK
  return results.sort((a, b) => {
    // Priority 1: Tema fields (S_FCODE)
    const isTemaA = a.fieldKey.startsWith('Tema');
    const isTemaB = b.fieldKey.startsWith('Tema');
    if (isTemaA && !isTemaB) return -1;
    if (!isTemaA && isTemaB) return 1;

    // Priority 2: Status (Error > Warning > OK)
    const score = (s) => {
      if (s === 'error') return 3;
      if (s === 'warning') return 2;
      return 1;
    };
    return score(b.status) - score(a.status);
  });
}
