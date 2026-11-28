import { placementCount } from './photoCompletion.mjs';

export function photoPositionDeliveryLines(summary, saved = false) {
  const { gml = 0, gmi = 0, keptExplicit = 0, keptUnavailable = 0 } = summary || {};
  return [
    gml && { key: 'gml', text: `${placementCount(gml)} ${saved ? 'satt til' : 'settes til'} GML i leveransen, slik at den godkjente posisjonen leveres` },
    gmi && { key: 'gmi', text: `${placementCount(gmi)} leveres i GMI igjen fordi posisjonen er tilbake ved GMI-objektet` },
    keptExplicit && { key: 'kept-explicit', review: true, text: `${placementCount(keptExplicit)} ${saved ? 'er flyttet' : 'flyttes'} bort fra GMI-objektet, men beholder GMI fordi du har valgt det. Kontroller leveringsvalget i FOTO.` },
    keptUnavailable && { key: 'kept-unavailable', review: true, text: `${placementCount(keptUnavailable)} ${saved ? 'er flyttet' : 'flyttes'} bort fra GMI-objektet, men GMI-koblingen kan ikke overføres til GML nå. Kontroller leveringsvalget i FOTO.` },
  ].filter(Boolean);
}
