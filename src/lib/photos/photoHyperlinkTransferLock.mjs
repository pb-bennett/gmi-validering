// Batch 1B.2B: the FOTO lock of an active «Flytt til punktobjekt» transfer: one code and one explanation per kind of
// action. Dependency-free, so the FOTO session and its delivery helpers can use it without importing Rettinger.
/** Error code of every FOTO action refused because an active transfer protects the photograph or source. */
export const PHOTO_HYPERLINK_TRANSFER_ACTIVE = 'hyperlink-transfer-active';
/** One explanation for every guarded action (UI and session results). */
export const PHOTO_HYPERLINK_TRANSFER_LOCK_TEXT = 'Bildelenken er flyttet til et annet punktobjekt i Rettinger (Foreslått). Leveringsvalg, plassering, retning, GMI-kilde og fjerning er låst for dette bildet til flyttingen angres eller forkastes i Rettinger.';
export const PHOTO_HYPERLINK_TRANSFER_SOURCE_LOCK_TEXT = 'GMI-kilden har bildelenker som er flyttet i Rettinger (Foreslått). Kilden kan ikke kontrolleres på nytt, kobles om eller fjernes før flyttingen angres eller forkastes i Rettinger.';
export const PHOTO_HYPERLINK_TRANSFER_LAYER_LOCK_TEXT = 'Fotolaget har bildelenker som er flyttet i Rettinger (Foreslått). Laget kan ikke slettes før flyttingen angres eller forkastes i Rettinger.';
