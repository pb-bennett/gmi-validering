'use client';

import { useState, useCallback } from 'react';
import useStore from '@/lib/store';
import { GMIParser } from '@/lib/parsing/gmiParser';

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const setFile = useStore((state) => state.setFile);
  const startParsing = useStore((state) => state.startParsing);
  const setParsingDone = useStore((state) => state.setParsingDone);
  const setParsingError = useStore((state) => state.setParsingError);
  const setData = useStore((state) => state.setData);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;

      // Update file metadata in store
      setFile({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        type: file.type,
      });

      startParsing();

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;

          // Basic validation before parsing
          if (!content || content.trim().length === 0) {
            throw new Error('Filen er tom. Velg en gyldig GMI-fil.');
          }

          const parser = new GMIParser(content);
          const parsedData = parser.toObject();

          // Check if parsing yielded any data
          if (
            parsedData.points.length === 0 &&
            parsedData.lines.length === 0
          ) {
            throw new Error(
              'Ingen objekter funnet i filen. Kontroller at filen inneholder gyldige GMI-data.'
            );
          }

          setData(parsedData);
          setParsingDone();
        } catch (error) {
          console.error('Parsing error:', error);
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
          'Kunne ikke lese filen. Kontroller at filen er tilgjengelig og prøv igjen.'
        );
      };

      // GMI files are typically text/latin1 or utf8, but let's assume text
      reader.readAsText(file, 'ISO-8859-1'); // Common for GMI/SOSI
    },
    [setFile, startParsing, setData, setParsingDone, setParsingError]
  );

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
    [handleFile]
  );

  const onInputChange = useCallback(
    (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile]
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
          {isDragging
            ? 'Slipp filen her'
            : 'Dra og slipp GMI-fil her'}
        </div>

        <div className="text-sm text-gray-500">eller</div>

        <label className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors">
          Velg fil
          <input
            type="file"
            className="hidden"
            accept=".gmi"
            onChange={onInputChange}
          />
        </label>

        <p className="text-xs text-gray-400 mt-2">
          Støtter .gmi filer
        </p>
      </div>
    </div>
  );
}
