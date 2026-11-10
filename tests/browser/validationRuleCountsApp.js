import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ValidationV2RuleList from '../../src/components/validation-v2/ValidationV2RuleList';
import { getValidationV2AggregateStatus, getValidationV2PresentationRules } from '../../src/lib/validation-v2/resultPresentation';

function App() {
  const [expanded, setExpanded] = useState(null);
  const [revised, setRevised] = useState(false);
  const [info, setInfo] = useState('');
  const [showLarge, setShowLarge] = useState(false);
  const outcomes = Array.from({ length: 73 }, (_, index) => ({
    objectRef: { key: `point:${index}`, geometryScope: 'point' },
    state: revised ? 'PASS' : index < 5 ? 'FAIL' : index === 5 ? 'CHECK' : 'PASS',
  }));
  const presentations = getValidationV2PresentationRules([{
    rule: { ruleId: 'counts', canonicalFieldId: 'insideOutside', geometryScopes: ['point'] }, outcomes,
  }], 'point');
  // Explicit presentation fixtures cover aggregate-only and empty legacy cards,
  // which the current engine normally omits from its visible list.
  const examples = [[24, 0, 145], [1, 1, 167], [0, 0, 169], [7, 0, 0], [19, 16, 134], [0, 24, 145], [0, 0, 0], [1, 0, 2], ...(showLarge ? [[12345, 1, 65]] : [])];
  const examplePresentations = examples.map(([failCount, checkCount, passCount], index) => ({
    ...presentations[0], expansionKey: `example-${index}`,
    status: getValidationV2AggregateStatus({ failCount, checkCount, passCount }),
    displayName: index === 4 ? 'Et svært langt feltnavn som skal avkortes uten å skyve resultatene ut av kortet' : `Eksempel ${index + 1}`,
    counts: { evaluatedCount: index === 7 ? 10 : failCount + checkCount + passCount,
      failCount, checkCount, passCount, indeterminateCount: 0, notEvaluatedCount: index === 7 ? 7 : 0 },
  }));
  return <main style={{ width: 380, padding: 12 }}>
    <button onClick={() => setRevised(!revised)}>{revised ? 'Foreslått' : 'Original'}</button>
    <button onClick={() => setShowLarge(!showLarge)}>Store tall</button>
    <ValidationV2RuleList presentations={[...presentations, ...examplePresentations]} expandedRuleKey={expanded}
      onToggle={(key) => setExpanded(expanded === key ? null : key)}
      onInfo={(presentation) => setInfo(presentation.displayName)} />
    <output>{info}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
