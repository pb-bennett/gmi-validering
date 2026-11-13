'use client';

import DeliveryWizard from '@/components/delivery/DeliveryWizard';

// Preserve FOTO's config owner and completion journey. M9 supplies every export.
export default function PhotoExportWizard({ layer, config, onConfigChange, openerRef, resumed = false, onOpenCompletion, onClose }) {
  return <DeliveryWizard initialMode={config.deliveryMode || 'photos-only'} initialPhotoLayerId={layer.id}
    initialSurveyLayerId={config.deliverySurveyId || ''} config={config} onConfigChange={onConfigChange}
    openerRef={openerRef} resumed={resumed} onOpenCompletion={onOpenCompletion} onClose={onClose} />;
}
