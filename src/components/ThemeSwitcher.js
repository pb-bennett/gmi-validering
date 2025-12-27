'use client';

import { useState, useEffect } from 'react';

const THEMES = [
  {
    id: 'blue',
    name: 'Modern Blue',
    colors: { primary: '#3b82f6', bg: '#f8fafc' },
  },
  {
    id: 'gray',
    name: 'Elegant Gray',
    colors: { primary: '#6b7280', bg: '#f9fafb' },
  },
  {
    id: 'green',
    name: 'Fresh Green',
    colors: { primary: '#10b981', bg: '#f0fdf4' },
  },
  {
    id: 'purple',
    name: 'Vibrant Purple',
    colors: { primary: '#8b5cf6', bg: '#faf5ff' },
  },
  {
    id: 'orange',
    name: 'Warm Orange',
    colors: { primary: '#f59e0b', bg: '#fffbeb' },
  },
];

export default function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState('blue');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load saved theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'blue';
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('theme', themeId);
    setIsExpanded(false);
  };

  return (
    <div className="absolute bottom-4 right-4 z-[1001] flex flex-col items-end gap-2">
      {/* Expanded theme options */}
      {isExpanded && (
        <div 
          className="flex flex-col gap-2 rounded-lg shadow-lg p-3 border animate-in slide-in-from-bottom-2"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)'
          }}
        >
          <div 
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Color Theme
          </div>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => changeTheme(theme.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                currentTheme === theme.id
                  ? 'ring-2'
                  : ''
              }`}
              style={{
                backgroundColor: currentTheme === theme.id ? 'var(--color-page-bg)' : 'transparent',
                borderColor: currentTheme === theme.id ? 'var(--color-border)' : 'transparent'
              }}
              onMouseEnter={(e) => {
                if (currentTheme !== theme.id) {
                  e.currentTarget.style.backgroundColor = 'var(--color-page-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentTheme !== theme.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div
                className="w-6 h-6 rounded-full border-2 shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.bg} 100%)`,
                  borderColor: 'var(--color-card)'
                }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {theme.name}
              </span>
              {currentTheme === theme.id && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-green-500 ml-auto"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border transition-colors"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-page-bg)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-card)'}
        title="Change color theme"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <path
            fillRule="evenodd"
            d="M4 2a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 2h12v11H4V4zm2 2a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h3a1 1 0 110 2H7a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {isExpanded ? 'Close' : 'Theme'}
        </span>
      </button>
    </div>
  );
}
