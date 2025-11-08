// constants.ts

import { ModelName } from './types';

export const SUPPORTED_TRANSLATION_LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Spanish', code: 'es' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Italian', code: 'it' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Mandarin Chinese', code: 'zh-CN' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Russian', code: 'ru' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Dutch', code: 'nl' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Thai', code: 'th' },
  { name: 'Vietnamese', code: 'vi' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Polish', code: 'pl' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Sinhala', code: 'si' }, // Added Sinhala as requested
];

export const DEFAULT_TARGET_LANGUAGE = 'English'; // Must be one of the names in SUPPORTED_TRANSLATION_LANGUAGES
export const LIVE_AUDIO_SAMPLE_RATE = 16000;
export const TTS_AUDIO_SAMPLE_RATE = 24000;
export const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096; // Must be one of 256, 512, 1024, 2048, 4096, 8192, 16384
export const THINKING_BUDGET_PRO = 32768; // Max for gemini-2.5-pro
export const MAX_CHUNKS_FOR_DISPLAY = 10; // Number of recent transcription chunks to display

// API Retry Configuration
export const API_MAX_RETRIES = 10;
export const API_RETRY_INITIAL_DELAY_MS = 1000; // 1 second
export const API_RETRY_BACKOFF_FACTOR = 2;