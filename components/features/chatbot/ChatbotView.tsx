import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, Chat, Modality, Part } from '@google/genai';
import type { ChatMessage, GroundingSource } from '../../../types';
import { fileToBase64 } from '../../../utils/video';
import { decode, decodeAudioData } from '../../../utils/audio';

// Singleton AudioContext for TTS playback
let outputAudioContext: AudioContext | null = null;
const getAudioContext = () => {
    if (!outputAudioContext || outputAudioContext.state === 'closed') {
        outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return outputAudioContext;
};

interface ChatbotViewProps {
  apiKey: string;
}

export const ChatbotView: React.FC<ChatbotViewProps> = ({ apiKey }) => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null); // message ID
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [inputError, setInputError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speakingSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey }), [apiKey]);

  useEffect(() => {
    const chatInstance = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are a helpful AI chatbot for users in Nepal. When providing information, prioritize sources and context relevant to Nepal.",
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
      },
    });
    setChat(chatInstance);
    setMessages([{
        id: 'initial',
        role: 'model',
        text: "नमस्ते! म नेपालको लागि तपाईंको सहयोगी हुँ। म तपाईंलाई नवीनतम जानकारी, समाचार, र नक्सा दिशाहरू प्रदान गर्न सक्छु। मलाई केहि पनि सोध्नुहोस्!"
    }]);
  }, [ai]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setImageFile(file);
        const reader = new FileReader();
        reader.onload = (event) => setImagePreview(event.target?.result as string);
        reader.readAsDataURL(file);
    }
  };

  const handleStopSpeak = useCallback(() => {
    if (speakingSourceRef.current) {
        speakingSourceRef.current.stop();
        speakingSourceRef.current.disconnect();
        speakingSourceRef.current = null;
    }
    setIsSpeaking(null);
  }, []);

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
        handleStopSpeak();
    };
  }, [handleStopSpeak]);

  const handleSpeak = async (text: string, messageId: string) => {
    if (isSpeaking === messageId) {
        handleStopSpeak();
        return;
    }
    if (isSpeaking) {
        handleStopSpeak();
    }

    setIsSpeaking(messageId);
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioCtx = getAudioContext();
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
            const source = audioCtx.createBufferSource();
            speakingSourceRef.current = source;
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.onended = () => {
                if (speakingSourceRef.current === source) {
                    setIsSpeaking(null);
                    speakingSourceRef.current = null;
                }
            };
            source.start();
        } else {
            setIsSpeaking(null);
        }
    } catch (error: any) {
        console.error("TTS Error:", error);
        alert(`Text-to-speech failed: ${error.message || 'Could not generate audio.'}`);
        setIsSpeaking(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !imageFile) || !chat || isLoading) return;

    const userMessage: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: input,
        image: imagePreview || undefined
    };
    setMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);

    try {
      const messageParts: (string | Part)[] = [{ text: input }];

      if (imageFile) {
        const base64Data = await fileToBase64(imageFile);
        messageParts.push({
            inlineData: { mimeType: imageFile.type, data: base64Data }
        });
      }

      setInput('');
      setImageFile(null);
      setImagePreview(null);
      if(fileInputRef.current) fileInputRef.current.value = "";


      const result = await chat.sendMessage({ message: messageParts });
      const modelResponse = result;
      
      const groundingChunks = modelResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources: GroundingSource[] = groundingChunks ? (groundingChunks as GroundingSource[]) : [];

      const modelMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: modelResponse.text,
        sources,
      };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Sorry, an error occurred: ${error.message || 'Please try again.'}`,
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setInputError(null);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            setRecordingState('transcribing');
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());

            try {
                const base64Audio = await fileToBase64(audioBlob);
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [
                        { text: "Transcribe this audio recording precisely." },
                        { inlineData: { mimeType: 'audio/webm', data: base64Audio } }
                    ]}
                });
                setInput(prev => (prev ? prev + ' ' : '') + response.text);
            } catch (err: any) {
                console.error("Transcription error:", err);
                setInputError(`Transcription failed: ${err.message || 'Please try again.'}`);
            } finally {
                setRecordingState('idle');
            }
        };

        mediaRecorder.start();
        setRecordingState('recording');
    } catch (err: any) {
        console.error("Microphone access error:", err);
        setInputError("Microphone access denied. Please grant permission to use voice input.");
        setRecordingState('idle');
    }
  }, [ai]);
  
  const handleMicClick = useCallback(() => {
    if (recordingState === 'recording') {
        stopRecording();
    } else if (recordingState === 'idle') {
        startRecording();
    }
  }, [recordingState, startRecording, stopRecording]);


  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-2xl px-4 py-3 max-w-lg shadow-md ${
                msg.role === 'user'
                  ? 'bg-cyan-600 rounded-br-none'
                  : msg.isError
                  ? 'bg-red-800 border border-red-600 rounded-bl-none'
                  : 'bg-gray-700 rounded-bl-none'
              }`}>
              {msg.image && <img src={msg.image} alt="User upload" className="rounded-lg mb-2 max-h-48" />}
              <p className="text-white whitespace-pre-wrap">{msg.text}</p>
              {msg.role === 'model' && msg.text && !msg.isError && (
                  <button onClick={() => handleSpeak(msg.text, msg.id)} disabled={isSpeaking && isSpeaking !== msg.id} className="text-cyan-300 hover:text-cyan-100 disabled:text-gray-500 mt-2">
                      {isSpeaking === msg.id ? (
                        <svg className="w-5 h-5 animate-pulse" xmlns="http://www.w.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h3V6H4v12zm5 0h3V6H9v12zm5 0h3V6h-3v12zm5 0h3V6h-3v12z"/></svg>
                      ) : (
                        <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                      )}
                  </button>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-600">
                  <h4 className="text-xs font-semibold text-gray-300 mb-2">Sources:</h4>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((source, i) => {
                      const sourceInfo = source.web || source.maps;
                      if (!sourceInfo?.uri || !sourceInfo.title) return null;

                      const isWeb = !!source.web;
                      const icon = isWeb ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 009-9m-9 9a9 9 0 00-9-9" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657l-4.243 4.243a2 2 0 01-2.828 0l-4.242-4.242a8 8 0 1111.312 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      );

                      return (
                        <a
                          key={`source-${i}`}
                          href={sourceInfo.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-x-2 bg-gray-800/60 hover:bg-gray-800 transition-colors p-2 rounded-lg text-sm text-cyan-200 shadow-sm border border-gray-600/50"
                          title={sourceInfo.title}
                        >
                          {icon}
                          <span className="truncate">{sourceInfo.title}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 max-w-lg shadow-md bg-gray-700 rounded-bl-none flex items-center space-x-2">
                    <div className="w-2 h-2 bg-cyan-300 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-cyan-300 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-cyan-300 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-gray-900 border-t border-gray-700/50">
        {imagePreview && (
          <div className="relative w-24 h-24 mb-2 p-1 border border-gray-600 rounded-md">
            <img src={imagePreview} alt="upload preview" className="w-full h-full object-cover rounded"/>
            <button onClick={() => {setImageFile(null); setImagePreview(null); if(fileInputRef.current) fileInputRef.current.value = "";}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">&times;</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center space-x-2 bg-gray-800 rounded-full p-2">
          <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} className="hidden" id="image-upload-chatbot"/>
          <label htmlFor="image-upload-chatbot" className="p-2 text-gray-400 hover:text-cyan-400 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3.375 3.375 0 0119.5 7.372l-8.55 8.55a.75.75 0 01-1.06-1.06l8.55-8.55a4.875 4.875 0 00-6.89-6.89l-10.94 10.94a6 6 0 108.486 8.486l7.693-7.693a.75.75 0 011.06 1.06z" /></svg>
          </label>
           <button type="button" onClick={handleMicClick} disabled={isLoading} className={`p-2 rounded-full transition-colors ${recordingState === 'recording' ? 'text-red-500 bg-red-500/20' : 'text-gray-400 hover:text-cyan-400'}`}>
              {recordingState === 'transcribing' ? (
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
              ) : recordingState === 'recording' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 animate-pulse"><path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
              )}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
            }}
            placeholder={
                recordingState === 'recording' ? 'Recording... Press mic to stop' : 
                recordingState === 'transcribing' ? 'Transcribing...' : 
                'Type or speak your message...'
            }
            className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none px-3"
            disabled={isLoading || recordingState !== 'idle'}
          />
          <button type="submit" disabled={isLoading || (!input.trim() && !imageFile)} className="bg-cyan-500 rounded-full p-3 text-white hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
          </button>
        </form>
        {inputError && (
            <p className="text-red-400 text-sm text-center mt-2">{inputError}</p>
        )}
      </div>
    </div>
  );
};
