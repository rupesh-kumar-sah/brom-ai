import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: `LiveSession` is not an exported member of `@google/genai`. It has been removed from this import.
import { GoogleGenAI, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';
import { Waveform } from './Waveform';
import { encode, decode, decodeAudioData } from '../../../utils/audio';

// FIX: A local interface for `LiveSession` is defined here based on its usage, as it's not exported from the library.
interface LiveSession {
  sendRealtimeInput(input: { media: Blob }): void;
  sendToolResponse(response: any): void;
  close(): void;
}

type AssistantState = 'idle' | 'listening' | 'connecting' | 'speaking';
type Language = 'english' | 'nepali' | 'maithili' | 'hindi';

const BASE_SYSTEM_INSTRUCTION = "You are a friendly and helpful AI assistant from Nepal named Brom (ब्रोम). You are an expert on all things related to Nepal. When asked about news, current events, or any real-time information, use your search tool to provide the most up-to-date answers focusing on Nepal. You can also perform a wide variety of actions including: controlling smart home devices, setting reminders and alarms, managing calendar events, sending messages, getting weather forecasts and directions, playing music, managing lists, translating text, and opening applications on the user's device. Always be helpful and friendly. Respond in ";

const LANGUAGE_CONFIGS: Record<Language, { name: string; systemInstruction: string; voice: string }> = {
  english: { name: 'English', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} English.`, voice: 'Zephyr' },
  nepali: { name: 'Nepali', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Nepali.`, voice: 'Zephyr' },
  maithili: { name: 'Maithili', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Maithili.`, voice: 'Zephyr' },
  hindi: { name: 'Hindi', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Hindi.`, voice: 'Zephyr' },
};

// Function declarations for tools
const controlLightFunctionDeclaration: FunctionDeclaration = {
  name: 'controlLight',
  parameters: {
    type: Type.OBJECT,
    description: 'Set the brightness and color temperature of a room light.',
    properties: {
      brightness: { type: Type.NUMBER, description: 'Light level from 0 to 100. Zero is off and 100 is full brightness.' },
      colorTemperature: { type: Type.STRING, description: 'Color temperature of the light fixture such as `daylight`, `cool` or `warm`.' },
    },
    required: ['brightness', 'colorTemperature'],
  },
};

const setReminderFunctionDeclaration: FunctionDeclaration = {
  name: 'setReminder',
  parameters: {
    type: Type.OBJECT,
    description: 'Sets a reminder for the user.',
    properties: {
      task: { type: Type.STRING, description: 'The task for the reminder.' },
    },
    required: ['task'],
  },
};

const sendMessageFunctionDeclaration: FunctionDeclaration = {
    name: 'sendMessage',
    parameters: {
        type: Type.OBJECT,
        description: 'Sends a text message to a recipient.',
        properties: {
            recipient: { type: Type.STRING, description: 'The name or number of the person to message.' },
            message: { type: Type.STRING, description: 'The content of the message.' },
        },
        required: ['recipient', 'message'],
    },
};

const setAlarmFunctionDeclaration: FunctionDeclaration = {
  name: 'setAlarm',
  parameters: {
    type: Type.OBJECT,
    description: 'Sets an alarm for a specific time.',
    properties: {
      time: { type: Type.STRING, description: 'The time to set the alarm for, e.g., "7:00 AM" or "in 15 minutes".' },
      label: { type: Type.STRING, description: 'An optional label for the alarm.' },
    },
    required: ['time'],
  },
};

const createCalendarEventFunctionDeclaration: FunctionDeclaration = {
  name: 'createCalendarEvent',
  parameters: {
    type: Type.OBJECT,
    description: 'Adds an event to the user\'s calendar.',
    properties: {
      title: { type: Type.STRING, description: 'The title of the event.' },
      date: { type: Type.STRING, description: 'The date of the event, e.g., "tomorrow" or "June 5th".' },
      time: { type: Type.STRING, description: 'The time of the event, e.g., "3 PM".' },
      duration: { type: Type.STRING, description: 'The duration of the event, e.g., "1 hour".' },
    },
    required: ['title', 'date', 'time'],
  },
};

const getWeatherForecastFunctionDeclaration: FunctionDeclaration = {
  name: 'getWeatherForecast',
  parameters: {
    type: Type.OBJECT,
    description: 'Gets the current weather forecast for a specified location.',
    properties: {
      location: { type: Type.STRING, description: 'The city or area to get the weather for, e.g., "San Francisco".' },
    },
    required: ['location'],
  },
};

const getDirectionsFunctionDeclaration: FunctionDeclaration = {
  name: 'getDirections',
  parameters: {
    type: Type.OBJECT,
    description: 'Provides navigation directions between two points.',
    properties: {
      destination: { type: Type.STRING, description: 'The destination address or place.' },
      startingPoint: { type: Type.STRING, description: 'The starting point. Defaults to current location if not provided.' },
    },
    required: ['destination'],
  },
};

const playMusicFunctionDeclaration: FunctionDeclaration = {
  name: 'playMusic',
  parameters: {
    type: Type.OBJECT,
    description: 'Plays music based on artist, song, or playlist.',
    properties: {
      artist: { type: Type.STRING, description: 'The name of the artist.' },
      song: { type: Type.STRING, description: 'The title of the song.' },
      playlist: { type: Type.STRING, description: 'The name of the playlist.' },
    },
  },
};

const addToListFunctionDeclaration: FunctionDeclaration = {
  name: 'addToList',
  parameters: {
    type: Type.OBJECT,
    description: 'Adds an item to a specified list, like a shopping or to-do list.',
    properties: {
      listName: { type: Type.STRING, description: 'The name of the list, e.g., "shopping".' },
      item: { type: Type.STRING, description: 'The item to add to the list.' },
    },
    required: ['listName', 'item'],
  },
};

const translateTextFunctionDeclaration: FunctionDeclaration = {
  name: 'translateText',
  parameters: {
    type: Type.OBJECT,
    description: 'Translates text from one language to another.',
    properties: {
      text: { type: Type.STRING, description: 'The text to be translated.' },
      targetLanguage: { type: Type.STRING, description: 'The language to translate the text into, e.g., "Spanish".' },
    },
    required: ['text', 'targetLanguage'],
  },
};

const launchAppFunctionDeclaration: FunctionDeclaration = {
  name: 'launchApp',
  parameters: {
    type: Type.OBJECT,
    description: "Opens or launches an application on the user's device.",
    properties: {
      appName: { type: Type.STRING, description: 'The name of the application to launch, e.g., "Spotify", "Twitter", "Runtastic".' },
    },
    required: ['appName'],
  },
};


export const AssistantView: React.FC = () => {
  const [state, setState] = useState<AssistantState>('idle');
  const [language, setLanguage] = useState<Language>('nepali');
  const [transcription, setTranscription] = useState<{ user: string, model: string }>({ user: '', model: '' });
  const [systemActions, setSystemActions] = useState<string[]>([]);
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

    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            let actionResult = "ok";
            let actionDescription = "";

            switch (fc.name) {
                case 'controlLight':
                    const { brightness = 100, colorTemperature = 'neutral' } = fc.args;
                    actionDescription = `💡 Light set to ${brightness}% brightness with a ${colorTemperature} temperature.`;
                    console.log(`Simulating light control:`, fc.args);
                    break;
                case 'setReminder':
                    const { task } = fc.args;
                    actionDescription = `⏰ Reminder set: "${task}"`;
                    console.log(`Simulating setting reminder:`, fc.args);
                    break;
                case 'sendMessage':
                    const { recipient, message: msgContent } = fc.args;
                    actionDescription = `💬 Message to ${recipient} queued: "${msgContent}"`;
                    console.log(`Simulating sending message:`, fc.args);
                    break;
                case 'setAlarm':
                    const { time, label } = fc.args;
                    actionDescription = `🚨 Alarm set for ${time}${label ? ` with label "${label}"` : ''}.`;
                    console.log(`Simulating setting alarm:`, fc.args);
                    break;
                case 'createCalendarEvent':
                    const { title, date, time: eventTime } = fc.args;
                    actionDescription = `📅 Event created: "${title}" on ${date} at ${eventTime}.`;
                    console.log(`Simulating creating calendar event:`, fc.args);
                    break;
                case 'getWeatherForecast':
                    const { location } = fc.args;
                    actionResult = `The weather in ${location} is currently sunny with a high of 75 degrees.`;
                    actionDescription = `☀️ Weather forecast requested for ${location}.`;
                    console.log(`Simulating getting weather:`, fc.args);
                    break;
                case 'getDirections':
                    const { destination, startingPoint } = fc.args;
                    actionDescription = `🗺️ Navigating to ${destination}${startingPoint ? ` from ${startingPoint}` : ''}.`;
                    console.log(`Simulating getting directions:`, fc.args);
                    break;
                case 'playMusic':
                    const { artist, song, playlist } = fc.args;
                    let playing = [];
                    if (song) playing.push(`the song "${song}"`);
                    if (artist) playing.push(`by the artist ${artist}`);
                    if (playlist) playing.push(`from the playlist "${playlist}"`);
                    let playingText = playing.length > 0 ? playing.join(' ') : 'some music';
                    actionDescription = `🎵 Playing ${playingText}.`;
                    console.log(`Simulating playing music:`, fc.args);
                    break;
                case 'addToList':
                    const { listName, item } = fc.args;
                    actionDescription = `📝 Added "${item}" to your ${listName} list.`;
                    console.log(`Simulating adding to list:`, fc.args);
                    break;
                case 'translateText':
                    const { text, targetLanguage } = fc.args;
                    actionResult = `The model will provide the translation for "${text}" into ${targetLanguage}.`;
                    actionDescription = `🌐 Translating "${text}" to ${targetLanguage}.`;
                    console.log(`Simulating translation:`, fc.args);
                    break;
                 case 'launchApp':
                    const { appName } = fc.args;
                    const appSchemeMap: Record<string, string> = {
                        'spotify': 'spotify://',
                        'twitter': 'twitter://',
                        'instagram': 'instagram://',
                        'youtube': 'youtube://',
                        'whatsapp': 'whatsapp://',
                        'facebook': 'fb://',
                        'slack': 'slack://',
                        'discord': 'discord://',
                    };
                    // FIX: The `appName` argument from the function call is of type `unknown`.
                    // It is cast to a string to allow calling `toLowerCase()`, which is safe
                    // because the function declaration schema requires it to be a string.
                    const lowerCaseAppName = (appName as string).toLowerCase();
                    const urlScheme = appSchemeMap[lowerCaseAppName] || `${lowerCaseAppName.replace(/\s/g, '')}://`;
                    
                    actionDescription = `🚀 Launching ${appName}...`;
                    actionResult = `Attempting to open ${appName}.`;
                    console.log(`Attempting to launch app: ${appName} with URL scheme: ${urlScheme}`);
                    window.location.href = urlScheme;
                    break;
                default:
                    actionDescription = `❓ Unknown action attempted: ${fc.name}`;
                    actionResult = "error: unknown function";
            }
            
            setSystemActions(prev => [actionDescription, ...prev].slice(0, 5));

            sessionPromiseRef.current?.then((session) => {
                session.sendToolResponse({
                  functionResponses: {
                    id : fc.id,
                    name: fc.name,
                    response: { result: actionResult },
                  }
                })
            });
        }
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
    setSystemActions([]);
  }, []);

  const startConversation = useCallback(async () => {
    setState('connecting');
    setTranscription({ user: '', model: '' });
    setSystemActions([]);

    try {
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputAudioContext;

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
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [
              controlLightFunctionDeclaration, 
              setReminderFunctionDeclaration, 
              sendMessageFunctionDeclaration,
              setAlarmFunctionDeclaration,
              createCalendarEventFunctionDeclaration,
              getWeatherForecastFunctionDeclaration,
              getDirectionsFunctionDeclaration,
              playMusicFunctionDeclaration,
              addToListFunctionDeclaration,
              translateTextFunctionDeclaration,
              launchAppFunctionDeclaration
            ] }
          ],
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
           ? "Try asking: 'नेपालको पछिल्लो समाचार के छ?' or 'Open Spotify'"
           : 'तपाईंको कुराकानी प्रगतिमा छ।'}
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
             <span className="font-semibold text-purple-400">Brom: </span>
             {transcription.model}
           </p>
        </div>
        
        {systemActions.length > 0 && (
            <div className="w-full mt-4 bg-gray-800/50 rounded-lg p-4 text-left">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">System Actions</h3>
                <ul className="space-y-2">
                    {systemActions.map((action, index) => (
                        <li key={index} className="text-sm text-gray-300 animate-fade-in">{action}</li>
                    ))}
                </ul>
            </div>
        )}
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