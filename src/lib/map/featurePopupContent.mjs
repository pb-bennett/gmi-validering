import { extractHyperlinkSourceParts } from '../hyperlinkFilenames.mjs';
import { createFilenameCopyAction, filenameCopyFeedback } from '../filenameClipboard.mjs';

// Phosphor regular Copy/Check paths from @phosphor-icons/react 2.1.10.
// DOM construction keeps the Leaflet popup text-safe without adding React roots.
const COPY_PATH = 'M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z';
const CHECK_PATH = 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z';

const appendCopyIcon = (button) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', COPY_PATH);
  svg.appendChild(path);
  button.appendChild(svg);
  return path;
};

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
    'gmi-feature-popup flex min-h-0 flex-col gap-1.5 p-1 text-[11px] leading-snug text-gmi-text';

  const header = document.createElement('div');
  header.className =
    'flex shrink-0 flex-wrap items-center gap-x-1 gap-y-0.5 pr-5 font-semibold text-gmi-navy';
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
  attributes.className = 'gmi-feature-popup-attributes min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-gmi-border pt-1.5 break-words';
  Object.entries(props).forEach(([key, value]) => {
    if (
      key !== 'featureType' &&
      key !== 'id' &&
      key !== 'S_FCODE' &&
      value !== null &&
      value !== ''
    ) {
      if (key === 'S_HYPERLINK') {
        const section = document.createElement('section');
        section.className = 'gmi-feature-popup-references my-1.5 border-y border-gmi-border bg-gmi-surface-soft px-2 py-1.5';
        section.setAttribute('aria-label', 'Filreferanser');
        const heading = document.createElement('h3');
        heading.className = 'mb-1 text-[11px] font-medium text-gmi-text-muted';
        heading.textContent = 'Filreferanser (S_HYPERLINK)';
        section.appendChild(heading);
        for (const { text, filename } of extractHyperlinkSourceParts(value)) {
          const reference = document.createElement('div');
          reference.className = 'gmi-feature-popup-reference flex items-start gap-1 py-0.5';
          appendText(reference, text, 'min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]');
          if (filename) {
            const copy = document.createElement('button');
            copy.className = 'gmi-compact-button gmi-focus-ring flex h-5 shrink-0 items-center justify-center gap-0.5 px-1 text-[10px] text-gmi-interactive';
            copy.setAttribute('type', 'button');
            copy.setAttribute('aria-label', `Kopier filnavn ${filename}`);
            copy.setAttribute('title', `Kopier filnavn ${filename}`);
            const iconPath = appendCopyIcon(copy);
            const feedback = appendText(reference, '', 'shrink-0 text-[10px] text-gmi-text-muted');
            feedback.setAttribute('role', 'status');
            const action = createFilenameCopyAction(filename, (status) => {
              copy.disabled = status === 'pending';
              iconPath.setAttribute('d', status === 'copied' ? CHECK_PATH : COPY_PATH);
              feedback.textContent = filenameCopyFeedback(status);
            });
            copy.onclick = (event) => action.copy(event);
            reference.appendChild(copy);
          }
          section.appendChild(reference);
        }
        attributes.appendChild(section);
        return;
      }
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
  actions.className = 'grid grid-cols-2 shrink-0 gap-1.5 border-t border-gmi-border pt-2';
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
