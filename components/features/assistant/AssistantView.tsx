import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: `LiveSession` is not an exported member of `@google/genai`. It has been removed from this import.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Waveform } from './Waveform';
import { encode, decode, decodeAudioData } from '../../../utils/audio';

// FIX: A local interface for `LiveSession` is defined here based on its usage, as it's not exported from the library.
interface LiveSession {
  sendRealtimeInput(input: { media: Blob }): void;
  close(): void;
}

type AssistantState = 'idle' | 'listening' | 'connecting' | 'speaking';
type Language = 'english' | 'nepali' | 'maithili' | 'hindi';

const LANGUAGE_CONFIGS: Record<Language, { name: string; systemInstruction: string; voice: string }> = {
  english: { name: 'English', systemInstruction: 'You are a friendly and helpful AI assistant named Echo. Respond in English.', voice: 'Zephyr' },
  nepali: { name: 'Nepali', systemInstruction: 'You are a friendly and helpful AI assistant named Echo. Respond in Nepali.', voice: 'Zephyr' },
  maithili: { name: 'Maithili', systemInstruction: 'You are a friendly and helpful AI assistant named Echo. Respond in Maithili.', voice: 'Zephyr' },
  hindi: { name: 'Hindi', systemInstruction: 'You are a friendly and helpful AI assistant named Echo. Respond in Hindi.', voice: 'Zephyr' },
};

export const AssistantView: React.FC = () => {
  const [state, setState] = useState<AssistantState>('idle');
  const [language, setLanguage] = useState<Language>('english');
  const [transcription, setTranscription] = useState<{ user: string, model: string }>({ user: '', model: '' });
  const [micLevel, setMicLevel] = useState(0);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    let animationFrameId: number | null = null;

    const loop = () => {
      if (state === 'listening' && analyserNodeRef.current) {
        const analyser = analyserNodeRef.current;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        
        let sumSquares = 0.0;
        for (const amplitude of dataArray) {
            const val = (amplitude / 128.0) - 1.0;
            sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        setMicLevel(Math.min(rms * 20, 10)); // Scale for better visualization
      } else {
        // Gently fade out the waveform when not actively listening
        setMicLevel(prev => Math.max(0, prev - 0.2));
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (state === 'listening' || state === 'speaking') {
      loop();
    } else {
      setMicLevel(0);
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [state]);

  const handleServerMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      setTranscription(prev => ({ ...prev, user: prev.user + text }));
    }
    if (message.serverContent?.outputTranscription) {
      setState('speaking');
      const text = message.serverContent.outputTranscription.text;
      setTranscription(prev => ({ ...prev, model: prev.model + text }));
    }
    if (message.serverContent?.turnComplete) {
      setTranscription({ user: '', model: '' });
      setState('listening');
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && outputAudioContextRef.current) {
      const outputCtx = outputAudioContextRef.current;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
      
      const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
      const source = outputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputCtx.destination);
      
      source.addEventListener('ended', () => {
          outputSourcesRef.current.delete(source);
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      outputSourcesRef.current.add(source);
    }
    
    if (message.serverContent?.interrupted) {
      outputSourcesRef.current.forEach(source => source.stop());
      outputSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setState('listening');
    }
  }, []);

  const stopConversation = useCallback(() => {
    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;

    inputAudioContextRef.current?.close().catch(console.error);
    inputAudioContextRef.current = null;

    outputSourcesRef.current.forEach(source => source.stop());
    outputSourcesRef.current.clear();
    outputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current = null;

    analyserNodeRef.current = null;
    
    setMicLevel(0);
    setState('idle');
  }, []);

  const startConversation = useCallback(async () => {
    setState('connecting');
    setTranscription({ user: '', model: '' });

    try {
      // Setup output audio
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputAudioContext;

      // Setup input audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputAudioContext;
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const selectedLanguageConfig = LANGUAGE_CONFIGS[language];
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedLanguageConfig.voice } },
          },
          systemInstruction: selectedLanguageConfig.systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (!inputAudioContextRef.current || !mediaStreamRef.current) {
                console.error("Input audio context or media stream not available.");
                stopConversation();
                return;
            }

            const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            mediaStreamSourceRef.current = source;

            // For waveform visualization
            const analyser = inputAudioContextRef.current.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            analyserNodeRef.current = analyser;

            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                  int16[i] = inputData[i] * 32768;
              }

              const pcmBlob: Blob = {
                  data: encode(new Uint8Array(int16.buffer)),
                  mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
            
            setState('listening');
          },
          onmessage: async (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            stopConversation();
          },
          onclose: (e: CloseEvent) => {
            console.log('Session closed');
            stopConversation();
          },
        },
      });

    } catch (error) {
      console.error('Failed to start conversation:', error);
      setState('idle');
    }
  }, [handleServerMessage, stopConversation, language]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  const getButtonState = () => {
    switch (state) {
      case 'idle':
        return { text: 'Start Conversation', icon: 'mic', action: startConversation, disabled: false };
      case 'connecting':
        return { text: 'Connecting...', icon: 'loader', action: () => {}, disabled: true };
      case 'listening':
        return { text: 'Listening...', icon: 'stop', action: stopConversation, disabled: false };
      case 'speaking':
        return { text: 'AI is Speaking...', icon: 'stop', action: stopConversation, disabled: false };
      default:
        return { text: 'Start', icon: 'mic', action: () => {}, disabled: true };
    }
  };

  const buttonState = getButtonState();

  return (
    <div className="flex flex-col h-full items-center justify-between text-center">
      <div className="flex-1 flex flex-col justify-center items-center w-full">
        <h2 className="text-2xl font-bold text-gray-200 mb-2">AI Assistant</h2>
        <p className="text-gray-400 mb-4 max-w-md">
          {state === 'idle' 
           ? 'Select your language, then press the button and start speaking.' 
           : 'Your conversation is in progress.'}
        </p>

        {state === 'idle' && (
          <div className="mb-8 w-full max-w-xs">
            <label htmlFor="language-select" className="block text-sm font-medium text-gray-400 mb-2">Language</label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5"
            >
              {Object.entries(LANGUAGE_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>{config.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="w-full bg-gray-800/50 rounded-lg p-6 min-h-[120px] relative text-left">
           <p className="text-lg text-gray-300">
             <span className="font-semibold text-cyan-400">You: </span>
             {transcription.user || (state === 'listening' ? '...' : '')}
           </p>
           <p className="text-lg text-white mt-4">
             <span className="font-semibold text-purple-400">Echo: </span>
             {transcription.model}
           </p>
        </div>
      </div>
      
      <div className="flex-shrink-0 w-full flex flex-col items-center justify-center p-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          {(state === 'listening' || state === 'speaking') && <Waveform level={micLevel} />}
          <button
            onClick={buttonState.action}
            disabled={buttonState.disabled}
            className={`z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4 focus:ring-cyan-500/50
              ${state === 'listening' ? 'bg-red-500 hover:bg-red-600' : 'bg-cyan-500 hover:bg-cyan-600'}
              ${state === 'connecting' ? 'bg-gray-600 cursor-not-allowed' : ''}
              ${state === 'speaking' ? 'bg-purple-500' : ''}
            `}
          >
            {buttonState.icon === 'mic' && <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
            {buttonState.icon === 'stop' && <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {buttonState.icon === 'loader' && <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>}
          </button>
        </div>
        <p className="mt-4 text-gray-300 font-semibold">{buttonState.text}</p>
      </div>
    </div>
  );
};
