import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { BottomNav } from './components/layout/BottomNav';
import { AssistantView } from './components/features/assistant/AssistantView';
import { ChatbotView } from './components/features/chatbot/ChatbotView';
import { ImageEditorView } from './components/features/imageEditor/ImageEditorView';
import { VideoGeneratorView } from './components/features/videoGenerator/VideoGeneratorView';
import { VideoAnalyzerView } from './components/features/videoAnalyzer/VideoAnalyzerView';
import type { Feature } from './types';
import { FEATURES } from './constants';

const ApiKeyPrompt: React.FC<{ onKeySubmit: (key: string) => void }> = ({ onKeySubmit }) => {
    const [inputKey, setInputKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleVerifyAndSet = async () => {
        if (!inputKey.trim()) {
            setError('Please enter a valid API key.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const ai = new GoogleGenAI({ apiKey: inputKey });
            await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ text: 'test' }] });
            onKeySubmit(inputKey);
        } catch (e: any) {
            console.error("API Key validation failed:", e);
            setError('Invalid API key or network error. Please check your key and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-screen h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-2xl text-center">
                <svg className="w-12 h-12 text-cyan-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                <h1 className="text-2xl font-bold text-white mt-4">Enter your API Key</h1>
                <p className="text-gray-400 mt-2">To use Brom AI, you need to provide your Google AI Studio API key. Your key is stored securely in your browser's session storage and is never sent to our servers.</p>
                <div className="mt-6">
                    <input
                        type="password"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="Enter your Google Gemini API Key"
                        className="w-full bg-gray-700 text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        disabled={isLoading}
                    />
                    {error && <p className="text-red-400 text-sm mt-2 text-left">{error}</p>}
                </div>
                <button
                    onClick={handleVerifyAndSet}
                    disabled={isLoading || !inputKey}
                    className="w-full mt-4 bg-cyan-500 rounded-md p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            <span>Verifying...</span>
                        </>
                    ) : 'Continue'}
                </button>
                <p className="text-xs text-gray-500 mt-4">You can get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Google AI Studio</a>.</p>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(() => sessionStorage.getItem('gemini-api-key'));
  const [activeFeature, setActiveFeature] = useState<Feature>(FEATURES[0]);
  const [showInstallPrompt, setShowInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setShowInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleKeySubmit = (key: string) => {
    sessionStorage.setItem('gemini-api-key', key);
    setApiKey(key);
  };

  useEffect(() => {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;

    const setViewHeight = () => {
      appContainer.style.height = `${window.innerHeight}px`;
    };

    window.addEventListener('resize', setViewHeight);
    setViewHeight();

    return () => window.removeEventListener('resize', setViewHeight);
  }, [apiKey]); // Rerun on apiKey change to set height after prompt is gone

  if (!apiKey) {
    return <ApiKeyPrompt onKeySubmit={handleKeySubmit} />;
  }

  const handleInstallClick = () => {
    if (!showInstallPrompt) return;
    (showInstallPrompt as any).prompt();
    (showInstallPrompt as any).userChoice.then(() => {
      setShowInstallPrompt(null);
    });
  };

  const renderFeature = () => {
    switch (activeFeature.id) {
      case 'assistant': return <AssistantView apiKey={apiKey} />;
      case 'chatbot': return <ChatbotView apiKey={apiKey} />;
      case 'image-editor': return <ImageEditorView apiKey={apiKey} />;
      case 'video-generator': return <VideoGeneratorView apiKey={apiKey} />;
      case 'video-analyzer': return <VideoAnalyzerView apiKey={apiKey} />;
      default: return <AssistantView apiKey={apiKey} />;
    }
  };

  return (
    <div id="app-container" className="w-screen bg-gray-900 text-gray-100 flex flex-col antialiased overflow-hidden">
      <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50 shadow-lg z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <svg className="w-8 h-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <h1 className="text-xl font-bold text-white tracking-tight">Brom AI</h1>
          </div>
          {showInstallPrompt && (
            <button
              onClick={handleInstallClick}
              className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Install App</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto h-full p-4 sm:p-6 lg:p-8">
          {renderFeature()}
        </div>
      </main>
      
      <footer className="flex-shrink-0 z-10">
        <BottomNav activeFeature={activeFeature} setActiveFeature={setActiveFeature} />
      </footer>
    </div>
  );
};

export default App;