
import React from 'react';

export interface Feature {
  id: 'assistant' | 'chatbot' | 'image-editor' | 'video-generator' | 'video-analyzer';
  name: string;
  // Fix: Use React.ReactElement as JSX is not in the scope of a .ts file.
  icon: React.ReactElement;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // For displaying uploaded image in chat
  sources?: GroundingSource[];
}

export interface GroundingSource {
    web?: {
        uri: string;
        title: string;
    };
    maps?: {
        uri: string;
        title: string;
        placeAnswerSources?: {
            reviewSnippets?: {
                uri: string;
                title: string;
                snippet: string;
            }[];
        };
    };
}