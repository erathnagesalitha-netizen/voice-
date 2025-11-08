// types.ts

export enum ModelName {
  GEMINI_FLASH_LATEST = 'gemini-2.5-flash',
  GEMINI_PRO_2_5 = 'gemini-2.5-pro',
  GEMINI_FLASH_TTS = 'gemini-2.5-flash-preview-tts',
  GEMINI_FLASH_LIVE_AUDIO = 'gemini-2.5-flash-native-audio-preview-09-2025',
}

export interface ChatMessage {
  type: 'user' | 'model';
  text: string;
  timestamp: string;
  isTranslated?: boolean;
}

/**
 * Custom Blob interface for the @google/genai SDK's `media` part.
 * This is distinct from the browser's native `Blob` object.
 */
export interface GenAI_Blob {
  data: string;
  mimeType: string;
}