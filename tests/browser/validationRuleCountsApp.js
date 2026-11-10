import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ValidationV2RuleList from '../../src/components/validation-v2/ValidationV2RuleList';
import { getValidationV2PresentationRules } from '../../src/lib/validation-v2/resultPresentation';

function App() {
  const [expanded, setExpanded] = useState(null);
  const [revised, setRevised] = useState(false);
  const [info, setInfo] = useState('');
  const outcomes = Array.from({ length: 73 }, (_, index) => ({
    objectRef: { key: `point:${index}`, geometryScope: 'point' },
    state: revised ? 'PASS' : index < 5 ? 'FAIL' : index === 5 ? 'CHECK' : 'PASS',
  }));
  const presentations = getValidationV2PresentationRules([{
    rule: { ruleId: 'counts', canonicalFieldId: 'insideOutside', geometryScopes: ['point'] }, outcomes,
  }], 'point');
  return <main style={{ width: 380, padding: 12 }}>
    <button onClick={() => setRevised(!revised)}>{revised ? 'Foreslått' : 'Original'}</button>
    <ValidationV2RuleList presentations={presentations} expandedRuleKey={expanded}
      onToggle={(key) => setExpanded(expanded === key ? null : key)}
      onInfo={(presentation) => setInfo(presentation.displayName)} />
    <output>{info}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
