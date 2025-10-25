import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader, ErrorDisplay } from '../../common/Loader';
import type { GroundingSource, NewsHeadline } from '../../../types';

interface NewsViewProps {
  apiKey: string;
}

const parseNewsText = (text: string): NewsHeadline[] => {
  const headlines: NewsHeadline[] = [];
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  lines.forEach(line => {
    // Regex to capture "1. Headline text - Source text"
    const match = line.match(/^\d+\.\s*(.+?)\s*-\s*(.+)$/);
    if (match) {
      headlines.push({
        title: match[1].trim(),
        source: match[2].trim(),
      });
    }
  });
  return headlines;
};


export const NewsView: React.FC<NewsViewProps> = ({ apiKey }) => {
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setHeadlines([]);
    setSources([]);
    const ai = new GoogleGenAI({ apiKey });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Fetch the latest top 5 news headlines from Nepal. Format the response as a numbered list where each item is \"Headline - Source\".",
        config: {
          tools: [{googleSearch: {}}],
        },
      });

      const parsedHeadlines = parseNewsText(response.text);
      if (parsedHeadlines.length === 0 && response.text) {
        throw new Error("Could not parse the news headlines from the response. The format might have changed.");
      }
      setHeadlines(parsedHeadlines);

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        setSources(groundingChunks as GroundingSource[]);
      }

    } catch (err: any) {
      console.error("Failed to fetch news:", err);
      setError(err.message || "An unexpected error occurred while fetching news.");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return (
    <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
            <h2 className="text-2xl font-bold text-gray-200">Latest News from Nepal</h2>
            <button
                onClick={fetchNews}
                disabled={isLoading}
                className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
                aria-label="Refresh news"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-11.664 0l3.181-3.183a8.25 8.25 0 00-11.664 0l3.181 3.183" />
                </svg>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
            {isLoading ? (
                <div className="flex items-center justify-center h-full">
                    <Loader text="Fetching latest headlines..." />
                </div>
            ) : error ? (
                <div className="flex items-center justify-center h-full">
                    <ErrorDisplay message={error} onRetry={fetchNews} />
                </div>
            ) : (
                <div className="space-y-4">
                    {headlines.map((headline, index) => (
                        <div key={index} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 hover:bg-gray-800 transition-colors">
                            <h3 className="text-lg font-semibold text-white">{headline.title}</h3>
                            <p className="text-sm text-cyan-400 mt-1">{headline.source}</p>
                        </div>
                    ))}

                    {sources.length > 0 && (
                        <div className="mt-8 pt-4 border-t border-gray-700">
                            <h4 className="text-md font-semibold text-gray-300 mb-3">Sources from Google Search:</h4>
                            <div className="flex flex-col space-y-2">
                                {sources.map((source, i) => {
                                    if (!source.web?.uri) return null;
                                    return (
                                        <a
                                            key={`source-${i}`}
                                            href={source.web.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-x-3 bg-gray-800 p-3 rounded-lg text-sm text-cyan-200 hover:bg-gray-700 transition-colors shadow-sm border border-gray-600/50"
                                            title={source.web.title}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                            </svg>
                                            <span className="truncate">{source.web.title || source.web.uri}</span>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};
