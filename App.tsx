// App.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Chat, Session } from '@google/genai';
import {
  initializeGeminiClient,
  startLiveSession,
  translateText,
  generateSpeech,
  createPcmBlob,
  playAudio,
  stopAllAudio,
  decodeAudioData,
  encodeWAV,
  detectLanguage, // Import new detectLanguage function
} from './services/geminiService';
import { DEFAULT_TARGET_LANGUAGE, LIVE_AUDIO_SAMPLE_RATE, SCRIPT_PROCESSOR_BUFFER_SIZE, SUPPORTED_TRANSLATION_LANGUAGES, TTS_AUDIO_SAMPLE_RATE } from './constants';
import TranscriptionDisplay from './components/TranscriptionDisplay';
import TranslationOutput from './components/TranslationOutput';
import Controls from './components/Controls';
import { ChatMessage } from './types';


const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscriptionChunk, setCurrentTranscriptionChunk] = useState<string>('');
  const [transcriptionHistory, setTranscriptionHistory] = useState<string[]>([]);
  const [translatedText, setTranslatedText] = useState<string>('');
  // Initialize target language with the name of the default language from the list
  const [targetLanguage, setTargetLanguage] = useState<string>(
    SUPPORTED_TRANSLATION_LANGUAGES.find(lang => lang.name === DEFAULT_TARGET_LANGUAGE)?.name || SUPPORTED_TRANSLATION_LANGUAGES[0].name
  );
  const [isThinkingModeEnabled, setIsThinkingModeEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSpeechOutput, setHasSpeechOutput] = useState<boolean>(false);
  const [lastGeneratedAudioBase64, setLastGeneratedAudioBase64] = useState<string | null>(null); // State to store last generated audio
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState<{ name: string; code: string } | null>(null); // New state for detected language

  // Refs for audio objects and live session
  const audioContextRef = useRef<AudioContext | null>(null); // For input audio
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Fix: The `ai.live.connect` method returns a `Session` object, not a `Chat` object.
  const liveSessionRef = useRef<Session | null>(null);
  const currentInputTranscriptionRef = useRef<string>(''); // For current turn's transcription
  const accumulatedTranscriptionRef = useRef<string>(''); // For entire recording session's transcription
  const currentOutputTranscriptionRef = useRef<string>('');

  // Refs for output audio (TTS playback)
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());


  // Utility to handle API Key selection for Veo models (if needed in the future)
  const ensureApiKeySelected = useCallback(async () => {
    // Only attempt to check/open key selection if window.aistudio exists and has the expected functions
    if (typeof window.aistudio !== 'undefined' && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        // Assume key selection will be successful after opening the dialog
        await window.aistudio.openSelectKey();
      }
    }
  }, []);

  // Effect to request microphone permission and setup/cleanup audio contexts
  useEffect(() => {
    // Initialize output audio context once
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new window.AudioContext({ sampleRate: TTS_AUDIO_SAMPLE_RATE });
      outputGainNodeRef.current = outputAudioContextRef.current.createGain();
      outputGainNodeRef.current.connect(outputAudioContextRef.current.destination);
    }

    return () => {
      // Input audio cleanup
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      // Fix: Call close() on the Session object, not Chat.
      if (liveSessionRef.current) {
        liveSessionRef.current.close();
        liveSessionRef.current = null;
      }

      // Output audio cleanup
      if (outputGainNodeRef.current) {
        outputGainNodeRef.current.disconnect();
        outputGainNodeRef.current = null;
      }
      if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
      }
      stopAllAudio(audioSourcesRef.current, nextStartTimeRef); // Call stopAllAudio with proper refs
    };
  }, []); // Run only once on mount

  // Callback to handle messages from the Live API session
  const handleLiveMessage = useCallback(async (message: LiveServerMessage) => {
    if (!outputAudioContextRef.current || !outputGainNodeRef.current) {
      console.error('Output audio context not initialized for live message handling.');
      return;
    }

    // Handle input transcription (user's speech)
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      currentInputTranscriptionRef.current += text; // Accumulate for the current turn
      accumulatedTranscriptionRef.current += text; // Accumulate for the entire recording session
      setCurrentTranscriptionChunk(currentInputTranscriptionRef.current); // For live display of current turn
    }
    // Handle output transcription (model's speech if enabled) - not used for primary translation flow after stop
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      currentOutputTranscriptionRef.current += text;
      // You can display model's output transcription if needed, or just rely on translatedText
      // console.log('Model output transcription:', currentOutputTranscriptionRef.current);
    }

    // A turn complete means user finished speaking for a brief period
    if (message.serverContent?.turnComplete) {
      const fullInputForTurn = currentInputTranscriptionRef.current.trim();
      if (fullInputForTurn) {
        setTranscriptionHistory((prev) => [...prev, fullInputForTurn]);
      }

      // Reset for the next turn's live transcription display
      currentInputTranscriptionRef.current = '';
      setCurrentTranscriptionChunk('');
      currentOutputTranscriptionRef.current = '';
    }
  }, []); // No dependencies related to translation/TTS, as it's deferred

  const handleLiveError = useCallback((e: ErrorEvent) => {
    console.error('Live session error:', e);
    setError(`Live session error: ${e.message}. Please try reconnecting.`);
    setIsRecording(false);
    // Fix: Call close() on the Session object, not Chat.
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
  }, []);

  const handleLiveClose = useCallback((e: CloseEvent) => {
    console.debug('Live session closed:', e);
    // Only set recording to false if it was active
    if (isRecording) {
      setIsRecording(false);
      setError('Live session disconnected. Please click "Start Recording" to reconnect.');
    }
    liveSessionRef.current = null;
  }, [isRecording]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stopping recording
      // Fix: Call close() on the Session object, not Chat.
      if (liveSessionRef.current) {
        liveSessionRef.current.close(); // Closes the WebSocket connection
        liveSessionRef.current = null;
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      setIsRecording(false); // Update recording state immediately
      stopAllAudio(audioSourcesRef.current, nextStartTimeRef); // Stop any ongoing TTS audio using refs
      setCurrentTranscriptionChunk('');
      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';
      setHasSpeechOutput(false);
      setLastGeneratedAudioBase64(null); // Clear stored audio for download
      setDetectedSourceLanguage(null); // Reset detected language

      // --- Trigger translation and TTS after recording stops ---
      const finalTranscription = accumulatedTranscriptionRef.current.trim();
      accumulatedTranscriptionRef.current = ''; // Clear for next session

      if (finalTranscription) {
        setIsLoading(true); // Start loading for translation/TTS
        try {
          // 1. Detect source language
          const detectedLang = await detectLanguage(finalTranscription);
          setDetectedSourceLanguage(detectedLang);

          // 2. Translate text using the detected language
          const translated = await translateText(
            finalTranscription,
            targetLanguage,
            isThinkingModeEnabled,
            detectedLang?.code || null // Pass the detected language code
          );
          setTranslatedText(translated);
          setHasSpeechOutput(false); // Reset before new speech generation

          // 3. Generate speech
          const base64Audio = await generateSpeech(translated);
          if (base64Audio) {
            await playAudio(
              base64Audio,
              outputAudioContextRef.current!, // Output context is guaranteed to exist by useEffect
              outputGainNodeRef.current!,
              nextStartTimeRef,
              audioSourcesRef.current
            );
            setHasSpeechOutput(true);
            setLastGeneratedAudioBase64(base64Audio); // Store for download
          } else {
            // Handle cases where generateSpeech returns no audio data after all retries
            setTranslatedText((prev) => prev + "\n\n(Note: Failed to generate speech for this translation.)");
          }
        } catch (translateError: any) {
          console.error('Translation/TTS error:', translateError);
          // Check for specific 429 error and provide user-friendly message
          if (translateError.code === 429 || translateError.status === 'RESOURCE_EXHAUSTED') {
            let apiMessage = translateError.message || 'You exceeded your current quota. Please check your plan and billing details.';
            
            let retryDelayMessage = '';
            let quotaInfoMessage = '';

            if (translateError.details && Array.isArray(translateError.details)) {
              const retryInfo = translateError.details.find((detail: any) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
              if (retryInfo && retryInfo.retryDelay) {
                const match = retryInfo.retryDelay.match(/(\d+)s/);
                if (match && match[1]) {
                  const delaySeconds = parseInt(match[1], 10);
                  retryDelayMessage = ` Please try again in ${delaySeconds} seconds.`;
                }
              }

              const quotaFailure = translateError.details.find((detail: any) => detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure');
              if (quotaFailure && quotaFailure.violations && Array.isArray(quotaFailure.violations)) {
                const dailyQuotaViolation = quotaFailure.violations.find((violation: any) => 
                  violation.quotaId && violation.quotaId.includes('PerDay')
                );
                if (dailyQuotaViolation) {
                  quotaInfoMessage = ` (You've exceeded the daily quota of ${dailyQuotaViolation.quotaValue} requests for this model.)`;
                }
              }
            }
            setError(`Quota Exceeded: ${apiMessage}${quotaInfoMessage}${retryDelayMessage}`);
          } else {
            setError(translateError.message || 'Failed to process translation or generate speech. Please try again.');
          }
          setTranslatedText('Error: Translation failed.');
        } finally {
          setIsLoading(false); // End loading
        }
      } else {
        setTranslatedText(''); // Clear if no transcription was accumulated
      }

    } else {
      // Starting recording
      setError(null);
      setTranslatedText('');
      setHasSpeechOutput(false);
      setLastGeneratedAudioBase64(null); // Clear stored audio for download
      setDetectedSourceLanguage(null); // Clear detected language
      currentInputTranscriptionRef.current = '';
      accumulatedTranscriptionRef.current = ''; // Reset accumulated transcription
      currentOutputTranscriptionRef.current = '';
      setCurrentTranscriptionChunk('');
      setTranscriptionHistory([]);

      try {
        await ensureApiKeySelected();
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContextRef.current = new window.AudioContext({
          sampleRate: LIVE_AUDIO_SAMPLE_RATE,
        });
        const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(
          SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1
        );

        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createPcmBlob(inputData);
          // Fix: `sendRealtimeInput` exists on `Session`, not `Chat`.
          liveSessionRef.current?.sendRealtimeInput({ media: pcmBlob });
        };

        source.connect(scriptProcessorRef.current);
        scriptProcessorRef.current.connect(audioContextRef.current.destination);

        // Start a new live session
        const session = await startLiveSession({
          onopen: () => { console.debug('Live session opened.'); },
          onmessage: handleLiveMessage,
          onerror: handleLiveError,
          onclose: handleLiveClose,
        });
        liveSessionRef.current = session;
        setIsRecording(true);
      } catch (err: any) {
        console.error('Error starting live session or audio processing:', err);
        setError(err.message || 'Failed to start audio processing. Check console for details.');
        // Ensure all resources are cleaned up if an error occurs during startup
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
          scriptProcessorRef.current.disconnect();
          scriptProcessorRef.current.onaudioprocess = null;
          scriptProcessorRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        setIsRecording(false);
      }
    }
  }, [isRecording, handleLiveMessage, handleLiveError, handleLiveClose, ensureApiKeySelected, targetLanguage, isThinkingModeEnabled]);

  // Function to replay the last translated speech
  const replayTranslatedSpeech = useCallback(async () => {
    if (translatedText && lastGeneratedAudioBase64) {
      if (!outputAudioContextRef.current || !outputGainNodeRef.current) {
        setError('Audio output system not initialized. Please try restarting the app.');
        return;
      }
      stopAllAudio(audioSourcesRef.current, nextStartTimeRef); // Stop any current playback before replaying
      setIsLoading(true);
      try {
        await playAudio(
          lastGeneratedAudioBase64,
          outputAudioContextRef.current,
          outputGainNodeRef.current,
          nextStartTimeRef,
          audioSourcesRef.current
        );
      } catch (err: any) {
        console.error('Error replaying speech:', err);
        setError(err.message || 'Failed to replay speech.');
      } finally {
        setIsLoading(false);
      }
    }
  }, [translatedText, lastGeneratedAudioBase64]);

  // Function to download the last translated speech
  const handleDownloadSpeech = useCallback(async () => {
    if (lastGeneratedAudioBase64) {
      if (!outputAudioContextRef.current) {
        setError('Audio output system not initialized. Cannot download.');
        return;
      }
      try {
        // Decode base64 to Uint8Array
        const binaryString = atob(lastGeneratedAudioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Decode raw PCM bytes to AudioBuffer using the output audio context
        const audioBuffer = await decodeAudioData(
          bytes,
          outputAudioContextRef.current, // Use the shared output audio context
          TTS_AUDIO_SAMPLE_RATE,
          1,
        );

        // Encode AudioBuffer to WAV Blob
        const wavBlob = encodeWAV(audioBuffer);

        // Create a download link
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `translated_speech_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading speech:', err);
        setError('Failed to download speech. Please try again.');
      }
    }
  }, [lastGeneratedAudioBase64]);


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4 font-sans antialiased text-gray-900">
      <h1 className="text-4xl font-extrabold text-center text-blue-700 mb-8 sm:mb-12">
        Voice Translator
      </h1>

      <div className="flex-grow max-w-2xl mx-auto w-full bg-white rounded-xl shadow-2xl p-6 sm:p-8 flex flex-col">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline ml-2">{error}</span>
            <span
              className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
              onClick={() => setError(null)}
            >
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </span>
          </div>
        )}

        {/* Transcription Display */}
        <TranscriptionDisplay
          currentTranscription={currentTranscriptionChunk}
          transcriptionHistory={transcriptionHistory}
          detectedSourceLanguage={detectedSourceLanguage} // Pass detected language
        />

        {/* Translation Output */}
        <TranslationOutput
          translatedText={translatedText}
          onPlaySpeech={replayTranslatedSpeech}
          onDownloadSpeech={handleDownloadSpeech} // Pass download handler
          isLoading={isLoading}
          hasSpeech={hasSpeechOutput}
          hasDownloadableSpeech={!!lastGeneratedAudioBase64} // Check if audio is available for download
        />

        {/* Controls (Record, Language, Thinking Mode) */}
        <Controls
          isRecording={isRecording}
          onToggleRecording={toggleRecording}
          targetLanguage={targetLanguage}
          onTargetLanguageChange={setTargetLanguage}
          isThinkingModeEnabled={isThinkingModeEnabled}
          onToggleThinkingMode={() => setIsThinkingModeEnabled((prev) => !prev)}
          isLoading={isLoading}
          supportedLanguages={SUPPORTED_TRANSLATION_LANGUAGES} // Pass supported languages
        />
      </div>
    </div>
  );
};

export default App;