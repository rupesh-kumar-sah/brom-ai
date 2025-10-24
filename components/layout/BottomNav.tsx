
import React from 'react';
import { FEATURES } from '../../constants';
import type { Feature } from '../../types';

interface BottomNavProps {
  activeFeature: Feature;
  setActiveFeature: (feature: Feature) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeFeature, setActiveFeature }) => {
  return (
    <nav className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700/50">
      <div className="max-w-4xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-around h-20">
          {FEATURES.map((feature) => (
            <button
              key={feature.id}
              onClick={() => setActiveFeature(feature)}
              className={`flex flex-col items-center justify-center w-full transition-colors duration-200 ease-in-out group ${
                activeFeature.id === feature.id ? 'text-cyan-400' : 'text-gray-400 hover:text-cyan-300'
              }`}
            >
              <div className="transform group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <span className={`text-xs font-semibold mt-1 ${activeFeature.id === feature.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>{feature.name}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};