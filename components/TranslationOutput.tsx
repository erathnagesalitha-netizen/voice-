// components/TranslationOutput.tsx
import React from 'react';

interface TranslationOutputProps {
  translatedText: string;
  onPlaySpeech: () => void;
  onDownloadSpeech: () => void; // New prop for download functionality
  isLoading: boolean;
  hasSpeech: boolean;
  hasDownloadableSpeech: boolean; // New prop to control download button visibility
}

const TranslationOutput: React.FC<TranslationOutputProps> = ({
  translatedText,
  onPlaySpeech,
  onDownloadSpeech, // Destructure new prop
  isLoading,
  hasSpeech,
  hasDownloadableSpeech, // Destructure new prop
}) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-inner mt-4 h-48 overflow-y-auto relative">
      <p className="text-gray-700 font-semibold mb-2">Translation:</p>
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-blue-500 text-lg">Thinking and Translating...</span>
        </div>
      ) : translatedText ? (
        <div className="relative">
          <p className="text-gray-800 text-lg leading-relaxed">{translatedText}</p>
          <div className="absolute bottom-2 right-2 flex space-x-2">
            {hasSpeech && (
              <button
                onClick={onPlaySpeech}
                className="p-2 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition-all duration-200"
                aria-label="Play translated speech"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.027L11.72 8.63c.535.412.535 1.156 0 1.569l-2.165 1.603C9.043 11.838 8 11.597 8 10.875V9.125c0-.722 1.043-.963 1.555-.598z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {hasDownloadableSpeech && ( // Render download button conditionally
              <button
                onClick={onDownloadSpeech}
                className="p-2 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 transition-all duration-200"
                aria-label="Download translated speech"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 11.586V4a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-gray-400 italic">Translated text will appear here.</p>
      )}
    </div>
  );
};

export default TranslationOutput;