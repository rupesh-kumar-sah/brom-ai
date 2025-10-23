
import React from 'react';

interface LoaderProps {
  text?: string;
}

export const Loader: React.FC<LoaderProps> = ({ text = "Processing..." }) => (
  <div className="flex flex-col items-center justify-center space-y-4 p-4">
    <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
    {text && <p className="text-cyan-300 font-medium tracking-wide">{text}</p>}
  </div>
);
