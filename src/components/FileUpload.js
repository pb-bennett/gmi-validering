'use client';

import { useState, useCallback } from 'react';
import useStore from '@/lib/store';
import { getDatasetCoordinate } from '@/lib/tracking/datasetCoordinate';
import { GMIParser } from '@/lib/parsing/gmiParser';
import { SOSIParser } from '@/lib/parsing/sosiParser';
import { KOFParser } from '@/lib/parsing/kofParser';

export function useFileLoader({ onComplete } = {}) {
  const setFile = useStore((state) => state.setFile);
  const startParsing = useStore((state) => state.startParsing);
  const setParsingDone = useStore((state) => state.setParsingDone);
  const setParsingError = useStore((state) => state.setParsingError);
  const setData = useStore((state) => state.setData);
  const clearData = useStore((state) => state.clearData);
  const addLayer = useStore((state) => state.addLayer);

  const trackUploadSuccess = async (datasetCoord) => {
    const logPrefix = '[tracking]';
    console.info(`${logPrefix} preparing upload tracking`, {
      hasDatasetCoord: Boolean(datasetCoord),
      epsg: datasetCoord?.epsg ?? null,
      sampleCount: datasetCoord?.sampleCount ?? null,
    });
    try {
      console.info(`${logPrefix} sending /api/track request`);
      const response = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'upload_success',
          datasetCoord,
        }),
        keepalive: true,
      });
      const payload = await response
        .clone()
        .json()
        .catch(() => null);
      console.info(`${logPrefix} /api/track response`, {
        ok: response.ok,
        status: response.status,
        location: payload?.location ?? null,
      });
    } catch (error) {
      console.warn(`${logPrefix} /api/track failed`, error);
      // Best-effort only; tracking should never block file parsing.
    }
  };

  const isQuotaExceededError = (err) => {
    const name = err?.name;
    const msg = String(err?.message || '');
    return (
      name === 'QuotaExceededError' ||
      msg.includes('QuotaExceededError') ||
      msg.includes('exceeded the quota') ||
      msg.includes('exceeded')
    );
  };

  const decodeSnippet = (arrayBuffer) => {
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const slice = bytes.slice(0, 2000);
      // Best-effort: for sniffing only.
      return new TextDecoder('iso-8859-1').decode(slice);
    } catch {
      return '';
    }
  };

  const decodeAll = (arrayBuffer) => {
    try {
      return new TextDecoder('iso-8859-1').decode(
        new Uint8Array(arrayBuffer),
      );
    } catch {
      return '';
    }
  };

  const detectFormat = (fileName, content) => {
    const ext = (fileName || '').toLowerCase().split('.').pop();
    if (ext === 'gmi') return 'GMI';
    if (ext === 'sos' || ext === 'sosi') return 'SOSI';
    if (ext === 'kof') return 'KOF';

    const head =
      content instanceof ArrayBuffer
        ? decodeSnippet(content)
        : (content || '').slice(0, 2000);
    if (head.includes('[GMIFILE_ASCII]')) return 'GMI';
    if (head.includes('HODE') || head.includes('.HODE'))
      return 'SOSI';

    return 'GMI';
  };

  const handleFile = useCallback(
    (file) => {
      if (!file) return;

      const ext = (file.name || '').toLowerCase().split('.').pop();
      const preferArrayBuffer = ext === 'sos' || ext === 'sosi';

      // Update file metadata in store
      setFile({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        type: file.type,
        format: null,
      });

      startParsing();

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;

          if (content instanceof ArrayBuffer) {
            if (content.byteLength === 0) {
              throw new Error('Filen er tom. Velg en gyldig fil.');
            }
          } else {
            // Basic validation before parsing
            if (!content || content.trim().length === 0) {
              throw new Error('Filen er tom. Velg en gyldig fil.');
            }
          }

          const format = detectFormat(file.name, content);

          // Update file metadata with detected format (shown in Oversikt)
          setFile({
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type,
            format,
          });

          let parsedData;
          if (format === 'SOSI') {
            // Pass raw bytes so sosijs can detect and decode charset correctly.
            const parser = new SOSIParser(
              content instanceof ArrayBuffer ? content : content,
            );
            parsedData = parser.parse();
          } else if (format === 'KOF') {
            const kofText =
              content instanceof ArrayBuffer
                ? decodeAll(content)
                : content;
            const parser = new KOFParser(kofText);
            parsedData = parser.parse();
          } else {
            const gmiText =
              content instanceof ArrayBuffer
                ? decodeAll(content)
                : content;
            const parser = new GMIParser(gmiText);
            parsedData = parser.toObject();
          }

          if (parsedData?.errors?.length > 0) {
            throw new Error(parsedData.errors[0]);
          }

          // Check if parsing yielded any data
          if (
            parsedData.points.length === 0 &&
            parsedData.lines.length === 0
          ) {
            throw new Error(
              'Ingen objekter funnet i filen. Kontroller at filen inneholder gyldige data.',
            );
          }

          // Create file metadata object
          const fileMeta = {
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: file.type,
            format,
          };

          // Always use layer system - add file as a new layer
          addLayer({ file: fileMeta, data: parsedData });

          // Also set legacy data/file state for backward compatibility
          setFile(fileMeta);
          setData(parsedData);
          setParsingDone();

          const datasetCoord = getDatasetCoordinate(parsedData);
          console.info('[tracking] dataset coordinate computed', {
            hasDatasetCoord: Boolean(datasetCoord),
            epsg: datasetCoord?.epsg ?? null,
            sampleCount: datasetCoord?.sampleCount ?? null,
            x: datasetCoord?.x ?? null,
            y: datasetCoord?.y ?? null,
          });
          trackUploadSuccess(datasetCoord);

          // Notify parent if callback provided
          if (onComplete) {
            onComplete();
          }
        } catch (error) {
          console.error('Parsing error:', error);

          // Exceptionally large files can cause Zustand persist/localStorage to exceed quota.
          // In that case, avoid getting stuck in a loop of failing writes and show a simple message.
          if (isQuotaExceededError(error)) {
            const quotaMessage =
              'Filen er for stor til å lastes inn i appen. Prøv med en annen fil.';

            // Best effort: clear oversized data from state before setting the error.
            try {
              clearData();
            } catch {}

            // Best effort: clear persisted key (may already be too large).
            try {
              if (
                typeof window !== 'undefined' &&
                window.localStorage
              ) {
                window.localStorage.removeItem(
                  'gmi-validator-storage',
                );
              }
            } catch {}

            try {
              setParsingError(quotaMessage);
            } catch {
              // Last-resort fallback if persistence keeps throwing.
              if (typeof window !== 'undefined' && window.alert) {
                window.alert(quotaMessage);
              }
            }

            return;
          }

          // Provide user-friendly Norwegian error message
          const userMessage =
            error.message.startsWith('Ugyldig') ||
            error.message.startsWith('Feil') ||
            error.message.startsWith('Ingen') ||
            error.message.startsWith('Filen')
              ? error.message
              : `Kunne ikke lese filen: ${error.message}`;
          setParsingError(userMessage);
        }
      };
      reader.onerror = () => {
        setParsingError(
          'Kunne ikke lese filen. Kontroller at filen er tilgjengelig og prøv igjen.',
        );
      };

      // GMI files are typically text/latin1 or utf8, but let's assume text
      if (preferArrayBuffer) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file, 'ISO-8859-1');
      }
    },
    [
      setFile,
      startParsing,
      setData,
      setParsingDone,
      setParsingError,
      clearData,
      addLayer,
      onComplete,
    ],
  );

  return { handleFile };
}

export default function FileUpload({
  onComplete,
  isAddingLayer = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const { handleFile } = useFileLoader({ onComplete });

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile],
  );

  const onInputChange = useCallback(
    (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile],
  );

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`
        border-2 border-dashed rounded-lg p-12 text-center transition-colors
        ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }
      `}
    >
      <div className="flex flex-col items-center justify-center gap-4">
        <svg
          className={`w-12 h-12 ${
            isDragging ? 'text-blue-500' : 'text-gray-400'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <div className="text-lg font-medium text-gray-700">
          {isDragging ? 'Slipp filen her' : 'Dra og slipp fil her'}
        </div>

        <div className="text-sm text-gray-500">eller</div>

        <label className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">
          Velg fil
          <input
            type="file"
            className="hidden"
            accept=".gmi,.sos,.sosi,.kof,.txt"
            onChange={onInputChange}
          />
        </label>

        <p className="text-xs text-gray-400 mt-2">
          Støtter .gmi, .sos/.sosi og .kof
        </p>
      </div>
    </div>
  );
}
