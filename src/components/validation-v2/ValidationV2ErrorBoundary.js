'use client';

import React from 'react';

export default class ValidationV2ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Validator 2.0 beta failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <h2 className="font-semibold">
            Validator 2.0 kunne ikke kjøres for dette laget.
          </h2>
          <p className="mt-1 text-red-700">
            Prøv å laste inn datasettet på nytt, eller bruk dagens validator.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
