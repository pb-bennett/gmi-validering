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

// Helper to determine pipe type
function getPipeType(attributes) {
  if (!attributes) return 'unknown';

  const code = (
    attributes.Tema ||
    attributes.S_FCODE ||
    ''
  ).toUpperCase();

  // Check for specific gravity types
  const isGravity =
    code.includes('SP') || code.includes('OV') || code.includes('AF');

  if (isGravity) {
    // Check for pressure pipes
    if (
      code.includes('TRYKK') ||
      code.includes('PUMP') ||
      code.includes('SPP')
    ) {
      return 'pressure';
    }
    return 'gravity';
  }

  // Check for water pipes (usually pressure)
  if (code.includes('VL') || code.includes('VANN')) {
    return 'pressure';
  }

  return 'other';
}

// Helper to get minimum incline based on dimension (Norwegian VA standards)
function getMinIncline(attributes, options = {}) {
  const mode = options.minInclineMode || 'variable';
  if (mode === 'fixed10') {
    return { min: 10, label: 'Fast 10‰' };
  }

  const dimStr = attributes.Dimensjon || attributes.Dim || '';
  // Extract number from string (e.g. "160mm" -> 160)
  const dim = parseInt(String(dimStr).replace(/\D/g, ''), 10);

  if (!dim || isNaN(dim)) {
    return { min: 10, label: '< 200mm (standard)' };
  }

  if (dim < 200) return { min: 10, label: `< 200mm` };
  if (dim <= 315) return { min: 4, label: `200-315mm` };
  return { min: 2, label: `> 315mm` };
}

export function analyzeIncline(data, options = {}) {
  if (!data || !data.lines) return [];

  const results = [];

  data.lines.forEach((line, index) => {
    const pipeType = getPipeType(line.attributes);

    // Filter: Only analyze Gravity and Pressure pipes (skip cables etc)
    if (pipeType === 'unknown' || pipeType === 'other') {
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
      pipeType: pipeType, // 'gravity' or 'pressure'
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

    const minInclineRule = getMinIncline(line.attributes, options);

    // Analyze segments for local backfall against the assumed flow
    const segments = [];
    let hasLocalBackfall = false;
    let hasLowSegmentIncline = false;

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

      if (segIncline < 0) {
        hasLocalBackfall = true;
      } else if (segIncline < minInclineRule.min) {
        hasLowSegmentIncline = true;
      }

      segments.push({
        index: i,
        startDist: p1.dist,
        endDist: p2.dist,
        startZ: p1.z,
        endZ: p2.z,
        length: segLen,
        incline: segIncline,
        isBackfall: segIncline < 0,
      });
    }

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
      hasLowSegmentIncline,
      minInclineRule,
    };

    // Determine Status
    if (pipeType === 'pressure') {
      result.status = 'ok';
      result.message = 'Trykkledning (ingen fallkrav)';
    } else {
      if (hasLocalBackfall) {
        result.status = 'warning';
        result.message = 'Advarsel: Motfall oppdaget';
      } else if (hasLowSegmentIncline) {
        result.status = 'warning';
        result.message = `Advarsel: Delstrekning under krav (${minInclineRule.min}‰)`;
      } else if (incline < minInclineRule.min) {
        result.status = 'warning';
        result.message = `Lite fall (${incline
          .toFixed(2)
          .replace('.', ',')}‰ < ${minInclineRule.min}‰)`;
      } else {
        result.status = 'ok';
        result.message = 'OK';
      }
    }

    results.push(result);
  });

  return results;
}
