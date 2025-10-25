import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// FIX: `LiveSession` is not an exported member of `@google/genai`. It has been removed from this import.
import { GoogleGenAI, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';
import { Waveform } from './Waveform';
import { encode, decode, decodeAudioData } from '../../../utils/audio';
import { ErrorDisplay } from '../../common/Loader';
import { SUPPORTED_APPS, AppPermissions } from '../settings/SettingsView';

// FIX: A local interface for `LiveSession` is defined here based on its usage, as it's not exported from the library.
interface LiveSession {
  sendRealtimeInput(input: { media: Blob }): void;
  sendToolResponse(response: any): void;
  close(): void;
}

type AssistantState = 'idle' | 'listening' | 'connecting' | 'speaking';
type Language = 'english' | 'nepali' | 'maithili' | 'hindi';

const BASE_SYSTEM_INSTRUCTION = "You are Echo, a friendly and helpful AI assistant from Nepal, an expert on all things related to the country. Your primary function is to provide the most current and accurate information. For any questions about news, current events, the current time and date, or any real-time information, you MUST use your search tool to find the latest details, with a strong focus on Nepal. You are also capable of performing a wide variety of actions such as making calls, sending messages, setting alarms and reminders, managing calendars, getting weather forecasts and directions, playing music, controlling smart home devices, managing lists, and opening applications. Always prioritize providing fresh, real-time information from your search tool when applicable. Be helpful and friendly. Respond in ";

const LANGUAGE_CONFIGS: Record<Language, { name: string; systemInstruction: string; voice: string }> = {
  english: { name: 'English', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} English.`, voice: 'Zephyr' },
  nepali: { name: 'Nepali', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Nepali.`, voice: 'Puck' },
  maithili: { name: 'Maithili', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Maithili.`, voice: 'Charon' },
  hindi: { name: 'Hindi', systemInstruction: `${BASE_SYSTEM_INSTRUCTION} Hindi.`, voice: 'Kore' },
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

const makeCallFunctionDeclaration: FunctionDeclaration = {
    name: 'makeCall',
    parameters: {
        type: Type.OBJECT,
        description: 'Makes a phone call to a specified contact or number.',
        properties: {
            contact: { type: Type.STRING, description: 'The name of the contact or the phone number to call.' },
        },
        required: ['contact'],
    },
};

const setTimerFunctionDeclaration: FunctionDeclaration = {
    name: 'setTimer',
    parameters: {
        type: Type.OBJECT,
        description: 'Sets a timer for a specified duration.',
        properties: {
            duration: { type: Type.STRING, description: 'The duration for the timer, e.g., "5 minutes", "1 hour 30 minutes".' },
            label: { type: Type.STRING, description: 'An optional label for the timer.' },
        },
        required: ['duration'],
    },
};

const getCalendarEventsFunctionDeclaration: FunctionDeclaration = {
  name: 'getCalendarEvents',
  parameters: {
    type: Type.OBJECT,
    description: 'Retrieves events from the user\'s calendar for a specific date.',
    properties: {
      date: { type: Type.STRING, description: 'The date to check for events, e.g., "today", "tomorrow". Defaults to "today" if not provided.' },
    },
  },
};

const playVideoFunctionDeclaration: FunctionDeclaration = {
  name: 'playVideo',
  parameters: {
    type: Type.OBJECT,
    description: 'Plays a TV show or movie.',
    properties: {
      title: { type: Type.STRING, description: 'The title of the movie or TV show.' },
      platform: { type: Type.STRING, description: 'The platform to play on, e.g., "Netflix", "YouTube".' },
    },
  },
};

const controlDeviceSettingsFunctionDeclaration: FunctionDeclaration = {
  name: 'controlDeviceSettings',
  parameters: {
    type: Type.OBJECT,
    description: 'Adjusts device settings like brightness, Wi-Fi, or Bluetooth.',
    properties: {
      setting: { type: Type.STRING, description: 'The setting to change, e.g., "brightness", "wifi", "bluetooth".' },
      value: { type: Type.STRING, description: 'The value to set, e.g., "50%", "on", "off".' },
    },
    required: ['setting', 'value'],
  },
};

interface AssistantViewProps {
  apiKey: string;
  activationMode: 'push-to-talk' | 'automatic';
  appPermissions: AppPermissions;
}

export const AssistantView: React.FC<AssistantViewProps> = ({ apiKey, activationMode, appPermissions }) => {
  const [state, setState] = useState<AssistantState>('idle');
  const [language, setLanguage] = useState<Language>('nepali');
  const [transcription, setTranscription] = useState<{ user: string, model: string }>({ user: '', model: '' });
  const [systemActions, setSystemActions] = useState<string[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const triedAutoStartRef = useRef(false);
  const transitionToListeningTimeoutRef = useRef<number | null>(null);
  
  const isMobile = useMemo(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent), []);

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
      
      if (transitionToListeningTimeoutRef.current) {
        clearTimeout(transitionToListeningTimeoutRef.current);
      }

      const outputCtx = outputAudioContextRef.current;
      if (outputCtx && nextStartTimeRef.current > outputCtx.currentTime) {
        const remainingPlaybackTime = Math.max(0, nextStartTimeRef.current - outputCtx.currentTime);
        const timeoutDuration = (remainingPlaybackTime * 1000) + 200;

        transitionToListeningTimeoutRef.current = window.setTimeout(() => {
          setState('listening');
          transitionToListeningTimeoutRef.current = null;
        }, timeoutDuration);
      } else {
        setState('listening');
      }
    }

    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            let actionResult = "ok";
            let actionDescription = "";

            switch (fc.name) {
                case 'controlLight':
                    const { brightness = 100, colorTemperature = 'neutral' } = fc.args;
                    actionDescription = `💡 Light set to ${brightness}% brightness with a ${colorTemperature} temperature. (Simulation)`;
                    actionResult = "I have simulated controlling the light as requested. In a real application, this would adjust a smart home device.";
                    break;
                case 'setReminder': {
                    const { task } = fc.args;
                    actionDescription = `📅 Opening Google Calendar to set reminder: "${task}"`;
                    actionResult = `I'm opening Google Calendar for you to set a reminder about "${task}".`;
                    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(task as string)}`;
                    window.open(calendarUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'sendMessage': {
                    if (!appPermissions['whatsapp']) {
                        actionDescription = `❌ Permission denied for WhatsApp.`;
                        actionResult = `I don't have permission to send messages with WhatsApp. You can enable this in the settings.`;
                        break;
                    }
                    const { recipient, message: msgContent } = fc.args;
                    actionDescription = `💬 Opening WhatsApp for message to ${recipient}.`;
                    actionResult = `I'm opening WhatsApp so you can send your message.`;
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(msgContent as string)}`;
                    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'setAlarm': {
                    const { time, label } = fc.args;
                    const query = `set an alarm for ${time}${label ? ` called ${label}` : ''}`;
                    actionDescription = `🚨 Opening Google to set alarm for ${time}...`;
                    actionResult = `I've opened a Google search for you to set the alarm.`;
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'createCalendarEvent': {
                    const { title, date, time: eventTime } = fc.args;
                    actionDescription = `📅 Opening Google Calendar to create event: "${title}"...`;
                    actionResult = `I'm opening Google Calendar with the details for "${title}" pre-filled for you.`;
                    const details = `Date: ${date}, Time: ${eventTime}`;
                    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title as string)}&details=${encodeURIComponent(details)}`;
                    window.open(calendarUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'getWeatherForecast': {
                    const { location } = fc.args;
                    actionDescription = `☀️ Opening Google Weather for ${location}.`;
                    actionResult = `I have opened Google's weather forecast for ${location} in a new tab.`;
                    const weatherUrl = `https://www.google.com/search?q=weather+in+${encodeURIComponent(location as string)}`;
                    window.open(weatherUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'getDirections': {
                    const { destination, startingPoint } = fc.args;
                    actionDescription = `🗺️ Opening Google Maps for directions to ${destination}.`;
                    actionResult = `I've opened Google Maps with directions to ${destination}.`;
                    const mapsUrl = `https://www.google.com/maps/dir/${startingPoint ? encodeURIComponent(startingPoint as string) : ''}/${encodeURIComponent(destination as string)}`;
                    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'playMusic': {
                    if (!appPermissions['spotify']) {
                        actionDescription = `❌ Permission denied for Spotify.`;
                        actionResult = `I don't have permission to play music on Spotify. You can enable this in the settings.`;
                        break;
                    }

                    const { artist, song, playlist } = fc.args;
                    let query = '';
                    if (song) query += `${song} `;
                    if (artist) query += `${artist} `;
                    if (playlist) query += `playlist ${playlist} `;
                    query = query.trim();

                    if (!query) {
                        actionDescription = `🎵 Opening Spotify.`;
                        actionResult = `Opening Spotify for you.`;
                        window.open('https://open.spotify.com', '_blank', 'noopener,noreferrer');
                    } else {
                        actionDescription = `🎵 Searching Spotify for "${query}".`;
                        actionResult = `Searching for "${query}" on Spotify.`;
                        const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
                        window.open(spotifySearchUrl, '_blank', 'noopener,noreferrer');
                    }
                    break;
                }
                case 'addToList':
                    const { listName, item } = fc.args;
                    actionDescription = `📝 Added "${item}" to your ${listName} list. (Simulation)`;
                    actionResult = `I've noted to add "${item}" to your ${listName} list. In a full app, this would sync with a to-do list service.`;
                    break;
                case 'translateText': {
                    const { text, targetLanguage } = fc.args;
                    actionDescription = `🌐 Opening Google Translate for "${text}" to ${targetLanguage}.`;
                    actionResult = `I'm opening Google Translate with your text ready to be translated.`;
                    const translateUrl = `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(targetLanguage as string)}&text=${encodeURIComponent(text as string)}&op=translate`;
                    window.open(translateUrl, '_blank', 'noopener,noreferrer');
                    break;
                }
                 case 'launchApp': {
                    const { appName } = fc.args;
                    const lowerCaseAppName = (appName as string).toLowerCase().trim();
                    const targetApp = SUPPORTED_APPS.find(app => lowerCaseAppName.includes(app.id));

                    if (!targetApp || !appPermissions[targetApp.id]) {
                        const appNameToDisplay = targetApp ? targetApp.name : appName;
                        actionDescription = `❌ Permission denied for ${appNameToDisplay}.`;
                        actionResult = `I don't have permission to launch ${appNameToDisplay}. You can enable this in the settings.`;
                        break;
                    }

                    actionDescription = `🚀 Launching ${targetApp.name}...`;

                    if (isMobile) {
                        const appSchemeMap: Record<string, string> = {
                            'spotify': 'spotify://', 'twitter': 'twitter://', 'instagram': 'instagram://',
                            'youtube': 'youtube://', 'whatsapp': 'whatsapp://', 'facebook': 'fb://',
                            'slack': 'slack://', 'discord': 'discord://', 'chrome': 'googlechrome://'
                        };
                        const urlScheme = appSchemeMap[targetApp.id] || `${targetApp.id.replace(/\s/g, '')}://`;
                        actionResult = `Attempting to open ${targetApp.name}.`;
                        setTimeout(() => { window.location.href = urlScheme; }, 500);
                    } else {
                        const webLinkMap: Record<string, string> = {
                            'spotify': 'https://open.spotify.com', 'twitter': 'https://twitter.com',
                            'instagram': 'https://instagram.com', 'youtube': 'https://youtube.com',
                            'whatsapp': 'https://web.whatsapp.com', 'facebook': 'https://facebook.com',
                            'slack': 'https://app.slack.com', 'discord': 'https://discord.com/app',
                            'chrome': 'https://google.com'
                        };
                        const webLink = webLinkMap[targetApp.id];
                        if (webLink) {
                            actionResult = `Opened ${targetApp.name} in a new browser tab.`;
                            window.open(webLink, '_blank', 'noopener,noreferrer');
                        } else {
                            actionDescription = `❌ Opening "${targetApp.name}" is not configured for this device.`;
                            actionResult = `I can't open "${targetApp.name}" on a desktop or tablet.`;
                        }
                    }
                    break;
                }
                case 'makeCall':
                    const { contact } = fc.args;
                    if (isMobile) {
                        actionDescription = `📞 Calling ${contact}...`;
                        if (/^[\d\s+-]+$/.test(contact as string)) {
                            const phoneNumber = (contact as string).replace(/\D/g, '');
                            actionResult = `Calling ${contact}.`;
                            setTimeout(() => { window.location.href = `tel:${phoneNumber}`; }, 500);
                        } else {
                            actionResult = `I can only call phone numbers directly. Please provide a full number.`;
                            actionDescription = `❌ Could not call ${contact}. Please provide a valid phone number.`;
                        }
                    } else {
                        actionDescription = `❌ Calling is only available on mobile devices.`;
                        actionResult = `I cannot make phone calls from this device.`;
                    }
                    break;
                case 'setTimer': {
                    const { duration, label: timerLabel } = fc.args;
                    const query = `set a timer for ${duration}${timerLabel ? ` called ${timerLabel}` : ''}`;
                    actionDescription = `⏳ Opening Google to set timer for ${duration}.`;
                    actionResult = `I have opened a Google search for you to start the timer.`;
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'getCalendarEvents': {
                    const { date: eventDate = 'today' } = fc.args;
                    actionDescription = `🗓️ Opening Google Calendar to view events for ${eventDate}.`;
                    actionResult = `I can't view your calendar events directly for security reasons, but I have opened Google Calendar for you to check.`;
                    window.open('https://calendar.google.com/', '_blank', 'noopener,noreferrer');
                    break;
                }
                case 'playVideo': {
                    const { title: videoTitle, platform } = fc.args;
                    const lowerCasePlatform = (platform as string || 'youtube').toLowerCase();
                    
                    if (lowerCasePlatform.includes('youtube')) {
                        if (!appPermissions['youtube']) {
                             actionDescription = `❌ Permission denied for YouTube.`;
                             actionResult = `I don't have permission to play videos on YouTube. You can enable this in the settings.`;
                             break;
                        }
                        
                        actionDescription = `🎬 Searching YouTube for "${videoTitle}".`;
                        actionResult = `Searching for "${videoTitle}" on YouTube.`;
                        const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(videoTitle as string)}`;
                        window.open(youtubeSearchUrl, '_blank', 'noopener,noreferrer');

                    } else {
                        actionDescription = `🎬 Playing "${videoTitle}"${platform ? ` on ${platform}` : ''}. (simulation)`;
                        actionResult = `I can't play videos from ${platform} yet, but I've noted your request.`;
                        console.log(`Simulating playing video:`, fc.args);
                    }
                    break;
                }
                case 'controlDeviceSettings':
                    const { setting, value } = fc.args;
                    actionDescription = `⚙️ Setting ${setting} to ${value}. (Simulation)`;
                    actionResult = `I cannot change device settings from a web browser. This action is simulated.`;
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
      if (transitionToListeningTimeoutRef.current) {
        clearTimeout(transitionToListeningTimeoutRef.current);
        transitionToListeningTimeoutRef.current = null;
      }
      outputSourcesRef.current.forEach(source => source.stop());
      outputSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setState('listening');
    }
  }, [isMobile, appPermissions]);

  const stopConversation = useCallback(() => {
    if (transitionToListeningTimeoutRef.current) {
        clearTimeout(transitionToListeningTimeoutRef.current);
        transitionToListeningTimeoutRef.current = null;
    }

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
    setError(null);
    setTranscription({ user: '', model: '' });
    setSystemActions([]);

    try {
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputAudioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputAudioContext;
      
      const ai = new GoogleGenAI({ apiKey });
      
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
              launchAppFunctionDeclaration,
              makeCallFunctionDeclaration,
              setTimerFunctionDeclaration,
              getCalendarEventsFunctionDeclaration,
              playVideoFunctionDeclaration,
              controlDeviceSettingsFunctionDeclaration
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
            setError(`A connection error occurred. Please try again.`);
            stopConversation();
          },
          onclose: (e: CloseEvent) => {
            console.log('Session closed');
            stopConversation();
          },
        },
      });

    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
        setError("Microphone access is required. Please grant permission and try again.");
      } else {
        setError("Could not start the session. Please check your connection and try again.");
      }
      setState('idle');
    }
  }, [handleServerMessage, stopConversation, language, apiKey]);

  useEffect(() => {
    // Effect for automatic activation mode
    if (activationMode === 'automatic' && state === 'idle' && !triedAutoStartRef.current && !error) {
      triedAutoStartRef.current = true;
      startConversation();
    }
  }, [activationMode, state, startConversation, error]);


  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  const getButtonState = () => {
    if (activationMode === 'automatic' && state === 'idle' && !error) {
       return { text: 'Activating...', icon: 'loader', action: () => {}, disabled: true };
    }
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
           ? activationMode === 'automatic'
             ? "Assistant is activating. Grant microphone permission when prompted."
             : "Try asking: 'Remind me to call mom', 'What's the weather in Kathmandu?', or 'Set a timer for 5 minutes'"
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
        
        {error && state === 'idle' && (
          <div className="w-full max-w-md my-4">
            <ErrorDisplay message={error} onRetry={startConversation} />
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
              ${state === 'connecting' || (activationMode === 'automatic' && state === 'idle' && !error) ? 'bg-gray-600 cursor-not-allowed' : ''}
              ${state === 'speaking' ? 'bg-purple-500' : ''}
            `}
          >
            {buttonState.icon === 'mic' && <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>}
            {buttonState.icon === 'stop' && <svg xmlns="http://www.w.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {buttonState.icon === 'loader' && <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>}
          </button>
        </div>
        <p className="mt-4 text-gray-300 font-semibold">{buttonState.text}</p>
      </div>
    </div>
  );
};