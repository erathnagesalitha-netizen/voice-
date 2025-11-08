// components/Controls.tsx
import React from 'react';
import { DEFAULT_TARGET_LANGUAGE } from '../constants';

interface ControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  targetLanguage: string;
  onTargetLanguageChange: (language: string) => void;
  isThinkingModeEnabled: boolean;
  onToggleThinkingMode: () => void;
  isLoading: boolean;
  supportedLanguages: { name: string; code: string }[]; // New prop for language options
}

const Controls: React.FC<ControlsProps> = ({
  isRecording,
  onToggleRecording,
  targetLanguage,
  onTargetLanguageChange,
  isThinkingModeEnabled,
  onToggleThinkingMode,
  isLoading,
  supportedLanguages, // Destructure new prop
}) => {
  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-md border border-gray-200 mt-6 sticky bottom-0 z-10 w-full">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Record Button */}
        <button
          onClick={onToggleRecording}
          disabled={isLoading}
          className={`flex items-center justify-center px-6 py-3 rounded-full text-lg font-bold shadow-md transition-all duration-300
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : 'bg-green-500 hover:bg-green-600 text-white'}
            ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
          `}
        >
          {isRecording ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm3 1a1 1 0 10-2 0v4a1 1 0 102 0V8z" clipRule="evenodd" />
              </svg>
              Stop Recording
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a3 3 0 00-3-3H7zM4 7a1 1 0 011-1h6a1 1 0 110 2H5a1 1 0 01-1-1zm1 3a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1zm3 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              Start Recording
            </>
          )}
        </button>

        {/* Target Language Dropdown */}
        <div className="flex-grow w-full md:w-auto">
          <label htmlFor="targetLanguage" className="sr-only">Target Language</label>
          <select
            id="targetLanguage"
            value={targetLanguage}
            onChange={(e) => onTargetLanguageChange(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-800 shadow-sm appearance-none pr-10" // Added appearance-none and pr-10 for better dropdown styling
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.name}>
                {lang.name}
              </option>
            ))}
          </select>
          {/* Optional: Add a custom arrow for the dropdown if appearance-none is used */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>


        {/* Thinking Mode Toggle */}
        <div className="flex items-center space-x-2">
          <label htmlFor="thinkingModeToggle" className="text-gray-700 font-medium">
            Thinking Mode
          </label>
          <input
            id="thinkingModeToggle"
            type="checkbox"
            checked={isThinkingModeEnabled}
            onChange={onToggleThinkingMode}
            className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default Controls;