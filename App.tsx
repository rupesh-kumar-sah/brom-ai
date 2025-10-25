import React, { useState, useEffect } from 'react';
import { BottomNav } from './components/layout/BottomNav';
import { AssistantView } from './components/features/assistant/AssistantView';
import { ChatbotView } from './components/features/chatbot/ChatbotView';
import { VideoAnalyzerView } from './components/features/videoAnalyzer/VideoAnalyzerView';
import { NewsView } from './components/features/news/NewsView';
import SettingsView, { AppPermissions, SUPPORTED_APPS } from './components/features/settings/SettingsView';
import type { Feature } from './types';
import { FEATURES } from './constants';

// The API key is now hardcoded into the application.
const API_KEY = 'AIzaSyCp2o4d7PIDIqV7-zj6VnNAZzBTWDekldg';

type Settings = {
  assistantActivation: 'push-to-talk' | 'automatic';
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  const handleActivationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({
      ...settings,
      assistantActivation: e.target.value as Settings['assistantActivation'],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 id="settings-title" className="text-xl font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="text-lg font-medium text-gray-200">Assistant Activation</label>
            <p className="text-sm text-gray-400 mt-1 mb-3">Choose how to start a conversation with Echo.</p>
            <fieldset className="space-y-3">
              <div className="flex items-center">
                <input id="push-to-talk" name="activation-mode" type="radio" value="push-to-talk" checked={settings.assistantActivation === 'push-to-talk'} onChange={handleActivationChange} className="h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500"/>
                <label htmlFor="push-to-talk" className="ml-3 block text-sm font-medium text-gray-300">
                  Push-to-Talk (Default)
                  <span className="block text-xs text-gray-500">Manually start and stop the assistant using the button.</span>
                </label>
              </div>
              <div className="flex items-center">
                <input id="automatic" name="activation-mode" type="radio" value="automatic" checked={settings.assistantActivation === 'automatic'} onChange={handleActivationChange} className="h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500"/>
                <label htmlFor="automatic" className="ml-3 block text-sm font-medium text-gray-300">
                  Automatic Listening
                  <span className="block text-xs text-gray-500">The assistant starts listening automatically when you open the tab.</span>
                </label>
              </div>
            </fieldset>
          </div>
        </div>
        <div className="bg-gray-800/50 px-6 py-4 border-t border-gray-700 text-right">
            <button onClick={onClose} className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-md hover:bg-cyan-700">
                Done
            </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState<Feature>(FEATURES[0]);
  const [showInstallPrompt, setShowInstallPrompt] = useState<Event | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({ assistantActivation: 'push-to-talk' });
  const [appPermissions, setAppPermissions] = useState<AppPermissions>(() => {
    // Default all supported apps to be enabled
    const initialPermissions: AppPermissions = {};
    SUPPORTED_APPS.forEach(app => {
      initialPermissions[app.id] = true;
    });
    return initialPermissions;
  });

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
      case 'assistant': return <AssistantView apiKey={API_KEY} activationMode={settings.assistantActivation} appPermissions={appPermissions} />;
      case 'chatbot': return <ChatbotView apiKey={API_KEY} />;
      case 'video-analyzer': return <VideoAnalyzerView apiKey={API_KEY} />;
      case 'news': return <NewsView apiKey={API_KEY} />;
      case 'settings': return <SettingsView appPermissions={appPermissions} onPermissionsChange={setAppPermissions} />;
      default: return <AssistantView apiKey={API_KEY} activationMode={settings.assistantActivation} appPermissions={appPermissions} />;
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
            <h1 className="text-xl font-bold text-white tracking-tight">Echo AI Suite</h1>
          </div>
          <div className="flex items-center space-x-4">
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
             <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              aria-label="Open settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
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
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
};

export default App;