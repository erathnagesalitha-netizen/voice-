// services/geminiService.ts
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse, Session, Type } from '@google/genai';
import { ModelName, GenAI_Blob } from '../types';
import {
  THINKING_BUDGET_PRO,
  LIVE_AUDIO_SAMPLE_RATE,
  TTS_AUDIO_SAMPLE_RATE,
  API_MAX_RETRIES,
  API_RETRY_INITIAL_DELAY_MS,
  API_RETRY_BACKOFF_FACTOR,
  SUPPORTED_TRANSLATION_LANGUAGES
} from '../constants';

/**
 * Utility function to decode base64 string to Uint8Array.
 * @param base64 The base64 encoded string.
 * @returns Uint8Array.
*/
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Utility function to encode Uint8Array to base64 string.
 * @param bytes The Uint8Array to encode.
 * @returns Base64 encoded string.
*/
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes raw PCM audio data into an AudioBuffer.
 * @param data The raw PCM data as Uint8Array.
 * @param ctx The AudioContext.
 * @param sampleRate The sample rate of the audio.
 * @param numChannels The number of audio channels.
 * @returns A promise that resolves with an AudioBuffer.
*/
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; // Convert to float range [-1, 1]
    }
  }
  return buffer;
}

/**
 * Creates a PCM Blob from Float32Array audio data.
 * @param data The Float32Array audio data.
 * @returns A GenAI_Blob object with PCM data.
*/
export function createPcmBlob(data: Float32Array): GenAI_Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768; // Convert float to 16-bit PCM
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${LIVE_AUDIO_SAMPLE_RATE}`,
  };
}

/**
 * Retries an asynchronous function with exponential backoff for specific retryable errors.
 * @param fn The asynchronous function to execute.
 * @param maxRetries Maximum number of retries.
 * @param initialDelayMs Initial delay in milliseconds before the first retry.
 * @param factor Exponential backoff factor.
 * @param operationName A descriptive name for the operation for logging purposes.
 * @returns A promise that resolves with the result of the function or rejects after max retries.
*/
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  initialDelayMs: number,
  factor: number,
  operationName: string = 'Operation',
): Promise<T> {
  let retries = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      console.warn(
        `${operationName}: Attempt ${retries + 1} failed: ${error.message}`
      );

      // Check for 503 (Service Unavailable) or 429 (Too Many Requests) errors
      // or specific "model overloaded" messages or custom errors
      const isApiError = typeof error === 'object' && error !== null && 'code' in error;
      const isRetryableError =
        (isApiError && (error.code === 503 || error.code === 429 || error.status === 'RESOURCE_EXHAUSTED')) ||
        (error.message && error.message.includes('The model is overloaded')) ||
        (error.message && error.message.includes('TTS API returned success but no audio data found')); // Custom retry condition

      if (!isRetryableError || retries >= maxRetries) {
        console.error(
          `${operationName}: Max retries (${maxRetries}) reached or non-retryable error. Giving up.`,
          error
        );
        // Propagate the original error object for more detailed handling in App.tsx
        throw error;
      }

      retries++;
      
      // Extract retryDelay from error details if available (e.g., for 429 errors)
      let customRetryDelay = 0;
      if (error.details && Array.isArray(error.details)) {
        const retryInfo = error.details.find((detail: any) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
        if (retryInfo && retryInfo.retryDelay) {
          // retryDelay can be in format like "59s"
          const match = retryInfo.retryDelay.match(/(\d+)s/);
          if (match && match[1]) {
            customRetryDelay = parseInt(match[1], 10) * 1000; // Convert to milliseconds
          }
        }
      }

      if (customRetryDelay > 0) {
        delay = customRetryDelay; // Use the API-provided delay
      } else {
        delay *= factor; // Exponential backoff
      }
      
      console.log(`${operationName}: Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Initializes the GoogleGenAI client.
 * @returns A new GoogleGenAI instance.
*/
export function initializeGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
}

interface LiveSessionCallbacks {
  onopen: () => void;
  onmessage: (message: LiveServerMessage) => void;
  onerror: (e: ErrorEvent) => void;
  onclose: (e: CloseEvent) => void;
}

/**
 * Connects to the Gemini Live API for real-time audio processing.
 * @param callbacks Callbacks for session events (open, message, error, close).
 * @returns A promise that resolves with the Live Session object.
*/
// Fix: The `ai.live.connect` method returns a `Session` object, not a `Chat` object.
export async function startLiveSession(
  callbacks: LiveSessionCallbacks,
): Promise<Session> {
  const ai = initializeGeminiClient();
  const sessionPromise = ai.live.connect({
    model: ModelName.GEMINI_FLASH_LIVE_AUDIO,
    callbacks: callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {}, // Enable transcription for user input audio.
      outputAudioTranscription: {}, // Enable transcription for model output audio.
      // Optional: Add speechConfig if you want model responses to use a specific voice
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
    },
  });
  return sessionPromise;
}

// Fix: Define a local interface to represent a mutable ref object,
// avoiding direct dependency on React's `MutableRefObject`.
interface MutableRefObjectLike<T> {
  current: T;
}

/**
 * Plays the received audio data from the Gemini model.
 * @param base64Audio The base64 encoded audio string.
 * @param audioContext The AudioContext to use for playback.
 * @param outputNode The GainNode to connect to (for volume control, etc.)
 * @param nextStartTimeRef A ref-like object to track the next available start time for audio playback.
 * @param audioSources A Set to keep track of active AudioBufferSourceNodes.
 * @returns A promise that resolves when the audio is scheduled.
*/
export async function playAudio(
  base64Audio: string,
  audioContext: AudioContext,
  outputNode: GainNode,
  nextStartTimeRef: MutableRefObjectLike<number>, // Fix: Use the custom interface
  audioSources: Set<AudioBufferSourceNode>
): Promise<void> {
  if (!base64Audio) return;

  try {
    nextStartTimeRef.current = Math.max(
      nextStartTimeRef.current,
      audioContext.currentTime,
    );
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      audioContext, // Use the provided audioContext
      TTS_AUDIO_SAMPLE_RATE,
      1,
    );
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputNode);
    outputNode.connect(audioContext.destination); // Ensure outputNode is connected to destination

    source.addEventListener('ended', () => {
      audioSources.delete(source);
    });

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
    audioSources.add(source);
  } catch (error) {
    console.error('Error playing audio:', error);
    throw error; // Re-throw for App.tsx to handle
  }
}

/**
 * Stops all currently playing audio and resets the playback queue.
 * @param audioSources A Set to keep track of active AudioBufferSourceNode.
 * @param nextStartTimeRef A ref-like object to track the next available start time for audio playback.
*/
export function stopAllAudio(
  audioSources: Set<AudioBufferSourceNode>,
  nextStartTimeRef: MutableRefObjectLike<number> // Fix: Use the custom interface
): void {
  for (const source of audioSources.values()) {
    source.stop();
    audioSources.delete(source);
  }
  nextStartTimeRef.current = 0;
}

/**
 * Helper to get language name from code for display/prompt construction
 * @param code The ISO 639-1 language code.
 * @returns The language name or the code itself if not found.
 */
function getLanguageNameFromCode(code: string): string {
  const lang = SUPPORTED_TRANSLATION_LANGUAGES.find(l => l.code === code);
  return lang ? lang.name : code; // Fallback to code if name not found
}

/**
 * Detects the language of the given text using the Gemini model.
 * @param text The text to detect the language for.
 * @returns A promise that resolves with an object containing the language name and its code, or null if detection fails.
 */
export async function detectLanguage(text: string): Promise<{ name: string; code: string } | null> {
  const ai = initializeGeminiClient();
  try {
    const response: GenerateContentResponse = await retry(
      () => ai.models.generateContent({
        model: ModelName.GEMINI_FLASH_LATEST, // Flash model is good for this
        contents: `Detect the language of the following text. Respond only with the language name and its ISO 639-1 code in JSON format like \`{"language": "English", "code": "en"}\`. If you cannot confidently detect the language, respond with \`{"language": "Unknown", "code": null}\`.
        \n\nText: "${text}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              language: { type: Type.STRING },
              code: { type: Type.STRING, nullable: true },
            },
            required: ['language'],
          },
        },
      }),
      API_MAX_RETRIES,
      API_RETRY_INITIAL_DELAY_MS,
      API_RETRY_BACKOFF_FACTOR,
      'Detect Language'
    );

    let jsonStr = response.text.trim();
    // Remove markdown code block if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.substring(7, jsonStr.lastIndexOf('```')).trim();
    } else if (jsonStr.startsWith('```')) { // Handle generic code block
        jsonStr = jsonStr.substring(3, jsonStr.lastIndexOf('```')).trim();
    }

    const detected = JSON.parse(jsonStr);

    if (detected.language && (detected.code || detected.code === null)) {
        return { name: detected.language, code: detected.code };
    }
    return null;
  } catch (error) {
    console.error('Error detecting language after retries:', error);
    return null;
  }
}

/**
 * Translates text using the Gemini model with retry logic.
 * @param text The text to translate.
 * @param targetLanguageName The name of the language to translate to (e.g., 'English').
 * @param useThinkingMode Whether to use the thinking mode (gemini-2.5-pro with budget).
 * @param sourceLanguageCode Optional. The ISO 639-1 code of the source language (e.g., 'en').
 * @returns A promise that resolves with the translated text.
*/
export async function translateText(
  text: string,
  targetLanguageName: string,
  useThinkingMode: boolean,
  sourceLanguageCode: string | null = null, // Added optional sourceLanguageCode
): Promise<string> {
  const ai = initializeGeminiClient();
  const model = useThinkingMode ? ModelName.GEMINI_PRO_2_5 : ModelName.GEMINI_FLASH_LATEST;

  const config = useThinkingMode
    ? { thinkingConfig: { thinkingBudget: THINKING_BUDGET_PRO } }
    : {};

  try {
    const sourceLanguageDisplayName = sourceLanguageCode && sourceLanguageCode !== 'null' ? getLanguageNameFromCode(sourceLanguageCode) : 'input';
    const prompt = `Translate the following ${sourceLanguageDisplayName} text into ${targetLanguageName}. If the text is already in ${targetLanguageName}, just confirm it without translating:\n\n"${text}"`;
    const response: GenerateContentResponse = await retry(
      () => ai.models.generateContent({
        model: model,
        contents: prompt,
        config: config,
      }),
      API_MAX_RETRIES,
      API_RETRY_INITIAL_DELAY_MS,
      API_RETRY_BACKOFF_FACTOR,
      'Translate Text'
    );
    return response.text;
  } catch (error) {
    console.error('Error translating text after retries:', error);
    throw error; // Propagate the original error object
  }
}

/**
 * Generates speech from text using the Gemini Text-to-Speech model with retry logic.
 * @param text The text to convert to speech.
 * @returns A promise that resolves with the base64 encoded audio string.
*/
export async function generateSpeech(text: string): Promise<string> {
  if (!text.trim()) {
    console.warn('generateSpeech: Received empty text, skipping speech generation.');
    return '';
  }
  const ai = initializeGeminiClient();
  try {
    const base64Audio = await retry(
      async () => {
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: ModelName.GEMINI_FLASH_TTS,
          contents: { parts: [{ text: text }] },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Using a prebuilt voice
            },
          },
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audioData) {
          // If no audio data, throw an error to trigger a retry
          // This specific message is checked in the retry logic.
          throw new Error('TTS API returned success but no audio data found in response.');
        }
        return audioData;
      },
      API_MAX_RETRIES,
      API_RETRY_INITIAL_DELAY_MS,
      API_RETRY_BACKOFF_FACTOR,
      'Generate Speech'
    );
    return base64Audio;
  } catch (error) {
    console.error('Error generating speech after retries:', error);
    throw error; // Propagate the original error object
  }
}

/**
 * Helper function to write a string to a DataView.
*/
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Helper function to convert Float32Array to 16-bit PCM and write to DataView.
*/
function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

/**
 * Encodes an AudioBuffer into a WAV Blob.
 * @param audioBuffer The AudioBuffer to encode.
 * @returns A Blob object containing the WAV audio data.
*/
export function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0); // Assuming mono, as TTS typically is

  const dataLength = samples.length * 2; // 16-bit PCM
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}