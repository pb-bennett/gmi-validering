'use client';

import React from 'react';

export default class ValidationV2ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Validator failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <h2 className="font-semibold">
            Validator kunne ikke kjøres for dette laget.
          </h2>
          <p className="mt-1 text-red-700">
            Prøv å laste inn datasettet på nytt.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
