import React, { useState, useEffect } from 'react';
import { BottomNav } from './components/layout/BottomNav';
import { AssistantView } from './components/features/assistant/AssistantView';
import { ChatbotView } from './components/features/chatbot/ChatbotView';
import { ImageEditorView } from './components/features/imageEditor/ImageEditorView';
import { VideoGeneratorView } from './components/features/videoGenerator/VideoGeneratorView';
import { VideoAnalyzerView } from './components/features/videoAnalyzer/VideoAnalyzerView';
import type { Feature } from './types';
import { FEATURES } from './constants';

// The API key is now hardcoded into the application.
const API_KEY = 'AIzaSyCp2o4d7PIDIqV7-zj6VnNAZzBTWDekldg';

const App: React.FC = () => {
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

  useEffect(() => {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;

    const setViewHeight = () => {
      appContainer.style.height = `${window.innerHeight}px`;
    };

    window.addEventListener('resize', setViewHeight);
    setViewHeight();

    return () => window.removeEventListener('resize', setViewHeight);
  }, []);

  const handleInstallClick = () => {
    if (!showInstallPrompt) return;
    (showInstallPrompt as any).prompt();
    (showInstallPrompt as any).userChoice.then(() => {
      setShowInstallPrompt(null);
    });
  };

  const renderFeature = () => {
    switch (activeFeature.id) {
      case 'assistant': return <AssistantView apiKey={API_KEY} />;
      case 'chatbot': return <ChatbotView apiKey={API_KEY} />;
      case 'image-editor': return <ImageEditorView apiKey={API_KEY} />;
      case 'video-generator': return <VideoGeneratorView apiKey={API_KEY} />;
      case 'video-analyzer': return <VideoAnalyzerView apiKey={API_KEY} />;
      default: return <AssistantView apiKey={API_KEY} />;
    }
  };

  return (
    <div id="app-container" className="w-screen bg-gray-900 text-gray-100 flex flex-col antialiased overflow-hidden">
      <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50 shadow-lg z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <svg className="w-8 h-8 text-cyan-400" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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
