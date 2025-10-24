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

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onRetry }) => (
  <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative text-center" role="alert">
    <strong className="font-bold">Error: </strong>
    <span className="block sm:inline">{message}</span>
    {onRetry && (
      <button
        onClick={onRetry}
        className="ml-4 mt-2 sm:mt-0 inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
      >
        Retry
      </button>
    )}
  </div>
);