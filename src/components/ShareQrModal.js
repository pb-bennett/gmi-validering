'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function iconDataUri(svgMarkup) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;
}

const APP_ICON_URI = iconDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="0" y="0" width="24" height="24" rx="12" fill="white"/>
  <path d="M6.2 16.8l4.5-1.9 3.1 3.1-7.6-1.2z" fill="#2563EB"/>
  <path d="M10.8 14.8l5.9-5.9 1.7 1.7-5.9 5.9-1.7-1.7z" fill="#1D4ED8"/>
  <path d="M14.8 6.3c1.1-1.1 2.9-1.1 4 0" stroke="#1D4ED8" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M13.3 4.8c1.9-1.9 4.9-1.9 6.8 0" stroke="#3B82F6" stroke-width="1.3" stroke-linecap="round"/>
  <circle cx="11" cy="14.5" r="1.2" fill="white"/>
</svg>
`);

const GITHUB_ICON_URI = iconDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="0" y="0" width="24" height="24" rx="12" fill="white"/>
  <path fill="#111827" d="M12 .5C5.65.5.5 5.7.5 12.1c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.9 1.3 3.7 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.3 2.9.2 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.9 1.1.9 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.35.5 12 .5z"/>
</svg>
`);

function QrPanel({ value, icon, label, size }) {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <QRCodeSVG
          value={value}
          size={size}
          level="H"
          includeMargin
          imageSettings={{
            src: icon,
            height: Math.round(size * 0.13),
            width: Math.round(size * 0.13),
            excavate: true,
          }}
        />
      </div>
      <div className="text-sm text-gray-600 text-center">{label}</div>
    </div>
  );
}

export default function ShareQrModal({ isOpen, onClose, repoUrl }) {
  const [activeTab, setActiveTab] = useState('app');
  const [copied, setCopied] = useState('');
  const appUrl =
    typeof window !== 'undefined' ? window.location.href : '';
  const qrSize =
    typeof window === 'undefined'
      ? 420
      : Math.max(
          300,
          Math.min(
            560,
            Math.floor(window.innerWidth * 0.42),
            Math.floor(window.innerHeight * 0.42),
          ),
        );

  const handleClose = () => {
    setActiveTab('app');
    setCopied('');
    onClose();
  };

  const currentValue = useMemo(() => {
    if (activeTab === 'github') return repoUrl;
    return appUrl || '';
  }, [activeTab, repoUrl, appUrl]);

  const currentLabel =
    activeTab === 'github' ? 'GitHub repository' : 'App URL';

  const copyCurrent = async () => {
    if (!currentValue) return;

    try {
      await navigator.clipboard.writeText(currentValue);
      setCopied(activeTab);
      setTimeout(() => setCopied(''), 1400);
    } catch {
      setCopied('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-10003 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-[min(96vw,1100px)] h-[min(92vh,900px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Del app
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded"
            title="Lukk"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded bg-gray-100">
            <button
              onClick={() => setActiveTab('app')}
              className={`text-sm py-2.5 rounded font-medium ${
                activeTab === 'app'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-gray-600'
              }`}
            >
              App URL
            </button>
            <button
              onClick={() => setActiveTab('github')}
              className={`text-sm py-2.5 rounded font-medium ${
                activeTab === 'github'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-gray-600'
              }`}
            >
              GitHub
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 flex flex-col justify-between overflow-hidden">
          <QrPanel
            value={currentValue}
            size={qrSize}
            icon={
              activeTab === 'github' ? GITHUB_ICON_URI : APP_ICON_URI
            }
            label={
              activeTab === 'github'
                ? 'Skann for å åpne repoet'
                : 'Skann for å åpne appen (anbefalt på desktop)'
            }
          />

          <div className="mt-6 border rounded p-3 bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">
              {currentLabel}
            </div>
            <a
              href={currentValue}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-blue-700 break-all hover:underline"
              title={currentValue}
            >
              {currentValue}
            </a>
            <div className="mt-3 flex justify-end">
              <button
                onClick={copyCurrent}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700"
              >
                {copied === activeTab ? 'Kopiert' : 'Kopier lenke'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
