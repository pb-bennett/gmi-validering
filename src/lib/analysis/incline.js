/**
 * Incline Analysis for Gravity Pipes
 *
 * Calculates incline (fall) for gravity pipes (Spillvann, Overvann, Felles).
 * Detects:
 * - Missing Z coordinates (Critical)
 * - Backfall (Motfall) (Error)
 * - Flat pipes (Error)
 * - Low incline (Warning)
 */

// Gravity pipe types (Nett_type or Funksjon)
const GRAVITY_TYPES = [
  'SP',
  'SPILLVANN',
  'OV',
  'OVERVANN',
  'AF',
  'FELLES',
  'VL', // Sometimes VL is gravity? No, usually pressure. But let's stick to SP/OV/AF for now.
  // Actually, let's be broader and filter OUT known pressure types if needed,
  // or stick to positive list.
];

// Helper to check if a pipe is a gravity pipe
function isGravityPipe(attributes) {
  if (!attributes) return false;

  // User requested to look ONLY at Tema or S_FCODE
  // and specifically for OV, AF, SP.
  const code = (
    attributes.Tema ||
    attributes.S_FCODE ||
    ''
  ).toUpperCase();

  // Check for specific gravity types
  const isGravity =
    code.includes('SP') || code.includes('OV') || code.includes('AF');

  if (isGravity) {
    // Still exclude pressure pipes if they happen to have SP/OV/AF in name (e.g. SP_TRYKK or SPP)
    if (
      code.includes('TRYKK') ||
      code.includes('PUMP') ||
      code.includes('SPP')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

// Helper to get minimum incline based on dimension (Norwegian VA standards)
function getMinIncline(attributes) {
  const dimStr = attributes.Dimensjon || attributes.Dim || '';
  // Extract number from string (e.g. "160mm" -> 160)
  const dim = parseInt(String(dimStr).replace(/\D/g, ''), 10);

  if (!dim || isNaN(dim)) return { min: 4, label: 'Ukjent dim' }; // Default safe limit

  if (dim < 200) return { min: 10, label: `< 200mm` };
  if (dim <= 315) return { min: 4, label: `200-315mm` };
  return { min: 2, label: `> 315mm` };
}

export function analyzeIncline(data) {
  if (!data || !data.lines) return [];

  const results = [];

  data.lines.forEach((line, index) => {
    // 1. Filter for gravity pipes
    // If no attributes, we can't determine type, but maybe we should include everything if it has Z?
    // No, that would include cables etc.
    if (!isGravityPipe(line.attributes)) {
      // Fallback: Check if it has 'Dimensjon' or 'Dim' which usually implies pipe
      // AND has Z coordinates. If it has Z, it's likely relevant for incline analysis.
      // But we don't want to analyze cables.
      // Let's stick to the isGravityPipe check for now, but I've broadened it above.
      return;
    }

    const coords = line.coordinates;
    if (!coords || coords.length < 2) {
      return; // Skip invalid geometry
    }

    const start = coords[0];
    const end = coords[coords.length - 1];

    const result = {
      lineIndex: index,
      attributes: line.attributes,
      status: 'ok',
      message: 'OK',
      details: {
        startZ: null,
        endZ: null,
        length: 0,
        incline: 0,
        deltaZ: 0,
      },
    };

    // 2. Check for Z coordinates
    // Note: Parser might store Z in 'z' property or 3rd element of array.
    // Assuming {x, y, z} object based on typical usage.

    // Check if Z exists and is not null/undefined/NaN for ALL points
    // We need all points to draw a proper profile
    const validPoints = coords.filter(
      (p) => typeof p.z === 'number' && !isNaN(p.z)
    );
    const hasAllZ = validPoints.length === coords.length;

    if (!hasAllZ) {
      result.status = 'error';
      result.message =
        'Mangler Z-koordinater på ett eller flere punkter';
      result.isCritical = true;
      results.push(result);
      return;
    }

    // 3. Calculate Length and Incline
    let totalLength2d = 0;
    const profilePoints = [];

    // Add first point
    profilePoints.push({
      x: start.x,
      y: start.y,
      z: start.z,
      dist: 0,
    });

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist2d = Math.sqrt(dx * dx + dy * dy);

      totalLength2d += dist2d;

      profilePoints.push({
        x: p2.x,
        y: p2.y,
        z: p2.z,
        dist: totalLength2d,
      });
    }

    const startZ = start.z;
    const endZ = end.z;

    // Determine flow direction based on Z
    // If StartZ < EndZ, we assume flow is End -> Start (Reverse of digitization)
    // This prevents flagging "Motfall" just because it was digitized uphill.
    const isDigitizedBackwards = startZ < endZ;

    // Calculate effective drop based on assumed flow
    const totalDrop = Math.abs(startZ - endZ);

    // Calculate average incline (permille) always positive relative to flow
    const incline =
      totalLength2d > 0 ? (totalDrop / totalLength2d) * 1000 : 0;

    // Analyze segments for local backfall against the assumed flow
    const segments = [];
    let hasLocalBackfall = false;

    for (let i = 0; i < profilePoints.length - 1; i++) {
      const p1 = profilePoints[i];
      const p2 = profilePoints[i + 1];
      const segLen = p2.dist - p1.dist;

      // Calculate drop for this segment based on assumed flow direction
      let segDrop;
      if (isDigitizedBackwards) {
        // Flow is End -> Start (p2 -> p1)
        segDrop = p2.z - p1.z;
      } else {
        // Flow is Start -> End (p1 -> p2)
        segDrop = p1.z - p2.z;
      }

      const segIncline = segLen > 0 ? (segDrop / segLen) * 1000 : 0;

      if (segDrop < -0.01) {
        // Allow tiny tolerance (1cm)
        hasLocalBackfall = true;
      }

      segments.push({
        index: i,
        startDist: p1.dist,
        endDist: p2.dist,
        startZ: p1.z,
        endZ: p2.z,
        length: segLen,
        incline: segIncline,
        isBackfall: segDrop < -0.01,
      });
    }

    const minInclineRule = getMinIncline(line.attributes);

    result.details = {
      startZ,
      endZ,
      length: totalLength2d,
      incline: parseFloat(incline.toFixed(2)),
      deltaZ: isDigitizedBackwards ? -totalDrop : totalDrop, // Keep original deltaZ sign for reference
      profilePoints,
      segments,
      isDigitizedBackwards,
      hasLocalBackfall,
      minInclineRule,
    };

    // Determine Status
    if (hasLocalBackfall) {
      result.status = 'warning';
      result.message = 'Advarsel: Motfall oppdaget';
    } else if (incline < minInclineRule.min) {
      // Optional: We could flag low incline as warning too, but user asked for "OK if all sections have fall"
      // However, standard compliance usually implies a warning for low fall.
      // User said: "OK is if all section have fall, advarsel is if one or more section has motfall."
      // BUT user also asked to "implement these standards".
      // Standards say < 10 permille for small pipes is NOT OK.
      // So I will add a specific message but keep status as OK or Warning based on strict interpretation?
      // "The pipe should only feil if there is motfall... make 2 statuses OK and Advarsel"
      // "Advarsel is if one or more section has motfall"
      // This contradicts "implement these standards".
      // I will follow the "implement standards" instruction as the latest and most specific regarding thresholds.
      // So I will flag low fall as a Warning (Advarsel) as well, because a pipe with 1 permille fall is effectively broken/illegal.

      result.status = 'warning';
      result.message = `Lite fall (${incline
        .toFixed(2)
        .replace('.', ',')}‰ < ${minInclineRule.min}‰)`;
    } else {
      result.status = 'ok';
      result.message = 'OK';
    }

    results.push(result);
  });

  return results;
}
