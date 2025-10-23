
import React from 'react';

interface WaveformProps {
  level: number;
}

export const Waveform: React.FC<WaveformProps> = ({ level }) => {
  const normalizedLevel = Math.min(Math.max(level, 0), 10);
  
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full border-2 border-cyan-500/50"
          style={{
            width: `${80 + normalizedLevel * 10 + i * (40 + normalizedLevel * 4)}%`,
            height: `${80 + normalizedLevel * 10 + i * (40 + normalizedLevel * 4)}%`,
            opacity: 1 - i * 0.3 - normalizedLevel * 0.05,
            transition: 'all 0.1s ease-out',
          }}
        />
      ))}
    </div>
  );
};
