'use client';

import DeliveryWizard from '@/components/delivery/DeliveryWizard';

// Rettinger and FOTO share one export workflow. Staged corrections stay owned
// by the existing registry; opening this wizard never marks them downloaded.
export default function GmiExportDialog({ layerId, onClose }) {
  return <DeliveryWizard initialMode="gmi-only" initialSurveyLayerId={layerId} onClose={onClose} />;
}
