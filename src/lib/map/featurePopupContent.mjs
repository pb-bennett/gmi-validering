const appendText = (parent, value, className) => {
  const text = document.createElement('span');
  if (className) text.className = className;
  text.textContent = String(value);
  parent.appendChild(text);
  return text;
};

const createButton = ({ className, featureId, featureType, index, layerId, label }) => {
  const button = document.createElement('button');
  button.className = className;
  button.setAttribute('data-feature-id', String(featureId));
  button.setAttribute('data-feature-type', String(featureType));
  button.setAttribute('data-index', String(index));
  button.setAttribute('data-layer-id', String(layerId));
  button.textContent = label;
  return button;
};

export const createFeaturePopupContent = (props, featureId, color, fcode) => {
  const content = document.createElement('div');
  content.className =
    'gmi-feature-popup flex max-h-72 flex-col gap-1.5 p-1 text-[11px] leading-snug text-gmi-text';

  const header = document.createElement('div');
  header.className =
    'flex flex-wrap items-center gap-x-1 gap-y-0.5 pr-5 font-semibold text-gmi-navy';
  appendText(header, 'Type:');
  appendText(header, props.featureType);

  if (fcode) {
    appendText(header, '•', 'text-gmi-text-subtle');
    appendText(header, 'Code:');
    const code = appendText(header, fcode);
    code.style.color = color;
    code.style.fontWeight = '700';
  }
  content.appendChild(header);

  const attributes = document.createElement('div');
  attributes.className = 'min-h-0 flex-1 overflow-auto border-t border-gmi-border pt-1.5 break-words';
  Object.entries(props).forEach(([key, value]) => {
    if (
      key !== 'featureType' &&
      key !== 'id' &&
      key !== 'S_FCODE' &&
      value !== null &&
      value !== ''
    ) {
      const label = document.createElement('strong');
      label.className = 'font-medium text-gmi-text-muted';
      label.textContent = key;
      attributes.appendChild(label);
      attributes.appendChild(document.createTextNode(': '));
      attributes.appendChild(document.createTextNode(String(value)));
      attributes.appendChild(document.createElement('br'));
    }
  });
  content.appendChild(attributes);

  const actions = document.createElement('div');
  actions.className = 'grid grid-cols-2 gap-1.5 border-t border-gmi-border pt-2';
  const buttonOptions = {
    featureId,
    featureType: props.featureType,
    index: props.id,
    layerId: props._layerId || '',
  };
  actions.appendChild(
    createButton({
      ...buttonOptions,
      className:
        'vis-i-3d-btn gmi-focus-ring rounded-md border border-gmi-border-strong bg-gmi-surface-soft px-2 py-1 text-[11px] font-medium text-gmi-text hover:bg-gmi-border',
      label: 'Vis i 3D',
    }),
  );
  actions.appendChild(
    createButton({
      ...buttonOptions,
      className:
        'inspect-data-btn gmi-focus-ring rounded-md bg-gmi-navy px-2 py-1 text-[11px] font-medium text-white hover:opacity-90',
      label: 'Inspiser data',
    }),
  );

  if (props.featureType === 'Line') {
    actions.appendChild(
      createButton({
        ...buttonOptions,
        className:
          'show-profile-btn gmi-focus-ring col-span-2 rounded-md border border-gmi-border-strong bg-gmi-surface-soft px-2 py-1 text-[11px] font-medium text-gmi-text hover:bg-gmi-border',
        label: 'Vis profilanalyse',
      }),
    );
  }

  content.appendChild(actions);
  return content;
};
