export const HydraulicTemaClass = Object.freeze({ PRESSURE: 'PRESSURE', GRAVITY: 'GRAVITY', SPECIAL: 'SPECIAL' });
export const GRAVITY_LINE_TEMAS = Object.freeze(['AF','AFO','DR','I2D','I2I','I2O','OV','OVF','OVI','OVKU','OVO','OVR','OVS','SP','SPGRÅ','SPI','SPO']);
export const PRESSURE_LINE_TEMAS = Object.freeze(['AFP','I2P','OVP','SPP','VL','VLBO','VLI','VLK','VLP','VLSPR','VLT','VLU']);
export const SDR_MATERIAL_FAMILY = Object.freeze(['PE','PE32','PE50','PE80','PE100','PE100-RC-PP0','PEH','PEH_PEM','PEL','PEM','PERC','PVC','PVC-O','PVC-U']);
export const RING_STIFFNESS_MATERIAL_FAMILY = Object.freeze(['ABS','GRP','GSE','GUP','PE','PE32','PE50','PE80','PE100','PE100-RC-PP0','PEH','PEH_PEM','PEL','PEM','PERC','PLAST','PP','PVC','PVC-O','PVC-U']);
const gravity = new Set(GRAVITY_LINE_TEMAS); const pressure = new Set(PRESSURE_LINE_TEMAS);
const sdrMaterials = new Set(SDR_MATERIAL_FAMILY); const ringStiffnessMaterials = new Set(RING_STIFFNESS_MATERIAL_FAMILY);
export function classifyHydraulicTema(tema, approvedTemas) {
  if (!approvedTemas.includes(tema)) return null;
  return gravity.has(tema) ? HydraulicTemaClass.GRAVITY : pressure.has(tema) ? HydraulicTemaClass.PRESSURE : HydraulicTemaClass.SPECIAL;
}
export function isSdrMaterial(material) { return sdrMaterials.has(material); }
export function isRingStiffnessMaterial(material) { return ringStiffnessMaterials.has(material); }
