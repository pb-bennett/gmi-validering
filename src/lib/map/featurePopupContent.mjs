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
    'text-[11px] leading-tight max-h-72 flex flex-col gap-1 p-1';

  const header = document.createElement('div');
  header.className =
    'font-semibold flex items-center gap-1 whitespace-nowrap';
  appendText(header, 'Type:');
  appendText(header, props.featureType);

  if (fcode) {
    appendText(header, '•', 'text-gray-400');
    appendText(header, 'Code:');
    const code = appendText(header, fcode);
    code.style.color = color;
    code.style.fontWeight = '700';
  }
  content.appendChild(header);

  const attributes = document.createElement('div');
  attributes.className = 'mt-1 border-t pt-1 flex-1 overflow-auto';
  Object.entries(props).forEach(([key, value]) => {
    if (
      key !== 'featureType' &&
      key !== 'id' &&
      key !== 'S_FCODE' &&
      value !== null &&
      value !== ''
    ) {
      const label = document.createElement('strong');
      label.textContent = key;
      attributes.appendChild(label);
      attributes.appendChild(document.createTextNode(': '));
      attributes.appendChild(document.createTextNode(String(value)));
      attributes.appendChild(document.createElement('br'));
    }
  });
  content.appendChild(attributes);

  const actions = document.createElement('div');
  actions.className = 'mt-1 pt-2 border-t grid grid-cols-2 gap-2';
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
        'vis-i-3d-btn px-2 py-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors',
      label: 'Vis i 3D',
    }),
  );
  actions.appendChild(
    createButton({
      ...buttonOptions,
      className:
        'inspect-data-btn px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-800 text-white rounded transition-colors',
      label: 'Inspiser data',
    }),
  );

  if (props.featureType === 'Line') {
    actions.appendChild(
      createButton({
        ...buttonOptions,
        className:
          'show-profile-btn col-span-2 px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors',
        label: 'Vis profilanalyse',
      }),
    );
  }

  content.appendChild(actions);
  return content;
};
