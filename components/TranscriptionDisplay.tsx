// components/TranscriptionDisplay.tsx
import React from 'react';
import { MAX_CHUNKS_FOR_DISPLAY } from '../constants';

interface TranscriptionDisplayProps {
  currentTranscription: string;
  transcriptionHistory: string[];
  detectedSourceLanguage: { name: string; code: string } | null; // New prop
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  currentTranscription,
  transcriptionHistory,
  detectedSourceLanguage, // Destructure new prop
}) => {
  const displayHistory = transcriptionHistory.slice(-MAX_CHUNKS_FOR_DISPLAY);

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-inner mb-4 h-48 overflow-y-auto">
      <p className="text-gray-700 font-semibold mb-2">Transcription:</p>
      {detectedSourceLanguage && (
        <p className="text-gray-500 text-sm italic mb-2">
          Detected Language: <span className="font-semibold text-gray-700">{detectedSourceLanguage.name}</span>
        </p>
      )}
      {displayHistory.map((chunk, index) => (
        <p key={index} className="text-gray-600 text-sm mb-1">
          {chunk}
        </p>
      ))}
      {currentTranscription && (
        <p className="text-blue-600 font-medium text-lg mt-2 animate-pulse">
          {currentTranscription}...
        </p>
      )}
      {!currentTranscription && displayHistory.length === 0 && !detectedSourceLanguage && (
        <p className="text-gray-400 italic">Start recording to see transcription.</p>
      )}
    </div>
  );
};

export default TranscriptionDisplay;