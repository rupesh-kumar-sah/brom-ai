import React from 'react';

// Define the shape of app permissions state
export type AppPermissions = {
  [key: string]: boolean;
};

// List of apps that can be controlled
export const SUPPORTED_APPS = [
  { id: 'youtube', name: 'YouTube', description: 'Allow Echo to play videos on YouTube.' },
  { id: 'chrome', name: 'Google Chrome', description: 'Allow Echo to open web pages.' },
  { id: 'spotify', name: 'Spotify', description: 'Allow Echo to play music on Spotify.' },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Allow Echo to send messages via WhatsApp.' },
  { id: 'instagram', name: 'Instagram', description: 'Allow Echo to open Instagram.' },
  { id: 'facebook', name: 'Facebook', description: 'Allow Echo to interact with Facebook.' },
];

interface SettingsViewProps {
  appPermissions: AppPermissions;
  onPermissionsChange: (newPermissions: AppPermissions) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ appPermissions, onPermissionsChange }) => {

  const handleToggle = (appId: string) => {
    onPermissionsChange({
      ...appPermissions,
      [appId]: !appPermissions[appId],
    });
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-bold text-gray-200 mb-6 text-center">App Permissions</h2>
      <p className="text-center text-gray-400 mb-8 max-w-lg mx-auto">
        Control which applications Echo AI Suite can interact with on your device. These permissions are used for features like opening apps and playing media.
      </p>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {SUPPORTED_APPS.map((app) => (
          <div key={app.id} className="bg-gray-800/50 rounded-lg p-4 flex justify-between items-center transition-all hover:bg-gray-800">
            <div>
              <h3 className="font-semibold text-white">{app.name}</h3>
              <p className="text-sm text-gray-400">{app.description}</p>
            </div>
            {/* Toggle Switch */}
            <label htmlFor={`toggle-${app.id}`} className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  id={`toggle-${app.id}`}
                  className="sr-only"
                  checked={appPermissions[app.id] ?? false}
                  onChange={() => handleToggle(app.id)}
                />
                <div className={`block w-14 h-8 rounded-full transition-colors ${appPermissions[app.id] ? 'bg-cyan-500' : 'bg-gray-600'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${appPermissions[app.id] ? 'transform translate-x-6' : ''}`}></div>
              </div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsView;