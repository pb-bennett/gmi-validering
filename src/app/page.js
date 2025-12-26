'use client';

import FileUpload from '@/components/FileUpload';
import DataDisplay from '@/components/DataDisplay';
import useStore from '@/lib/store';

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <div className="flex-none py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              GMI Validering
            </h1>
            <p className="mt-2 text-gray-600">
              Last opp og valider GMI-filer
            </p>
          </div>

          {parsingStatus !== 'done' && (
            <div className="bg-white shadow rounded-lg p-6">
              <FileUpload />
            </div>
          )}
        </div>
      </div>

      {parsingStatus === 'done' && (
        <div className="flex-1 overflow-hidden px-4 sm:px-6 lg:px-8 pb-8">
          <div className="max-w-7xl mx-auto h-full">
            <DataDisplay />
          </div>
        </div>
      )}
    </div>
  );
}
