'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { XIcon } from '@phosphor-icons/react';

const GMI_MARK_URL = '/brand/gmi-validator-logo.svg';

function QrPanel({ value, label, size }) {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="rounded-xl border border-gmi-border bg-gmi-surface p-4 shadow-sm">
        <QRCodeSVG
          value={value}
          size={size}
          level="H"
          includeMargin
          imageSettings={{
            src: GMI_MARK_URL,
            height: Math.round(size * 0.13),
            width: Math.round(size * 0.13),
            excavate: true,
          }}
        />
      </div>
      <div className="text-sm text-gmi-text-muted text-center">{label}</div>
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
      className="fixed inset-0 z-10003 flex items-center justify-center bg-gmi-ink/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="gmi-elevated-surface rounded-xl shadow-xl w-[min(96vw,1100px)] h-[min(92vh,900px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gmi-border">
          <h2 className="text-xl font-semibold text-gmi-navy">
            Del app
          </h2>
          <button
            onClick={handleClose}
            className="gmi-compact-button gmi-focus-ring text-gmi-text-subtle hover:text-gmi-navy p-1.5"
            title="Lukk"
            aria-label="Lukk"
          >
            <XIcon size={20} weight="regular" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-gmi-surface-soft">
            <button
              onClick={() => setActiveTab('app')}
              className={`gmi-focus-ring text-sm py-2.5 rounded-lg font-medium ${
                activeTab === 'app'
                  ? 'gmi-selected-control shadow-sm'
                  : 'text-gmi-text-muted hover:bg-gmi-surface'
              }`}
            >
              App URL
            </button>
            <button
              onClick={() => setActiveTab('github')}
              className={`gmi-focus-ring text-sm py-2.5 rounded-lg font-medium ${
                activeTab === 'github'
                  ? 'gmi-selected-control shadow-sm'
                  : 'text-gmi-text-muted hover:bg-gmi-surface'
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
            label={
              activeTab === 'github'
                ? 'Skann for å åpne repoet'
                : 'Skann for å åpne appen (anbefalt på desktop)'
            }
          />

          <div className="mt-6 border border-gmi-border rounded-lg p-3 bg-gmi-surface-soft">
            <div className="text-xs text-gmi-text-subtle mb-1">
              {currentLabel}
            </div>
            <a
              href={currentValue}
              target="_blank"
              rel="noreferrer"
              className="gmi-focus-ring block text-sm text-gmi-interactive break-all hover:underline"
              title={currentValue}
            >
              {currentValue}
            </a>
            <div className="mt-3 flex justify-end">
              <button
                onClick={copyCurrent}
                className="gmi-elevated-surface gmi-compact-button gmi-focus-ring text-sm px-3 py-1.5"
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
