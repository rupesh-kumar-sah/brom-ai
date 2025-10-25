import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader, ErrorDisplay } from '../../common/Loader';
import { extractFramesFromVideo } from '../../../utils/video';

interface VideoAnalyzerViewProps {
  apiKey: string;
}

interface Segment {
  id: number;
  start: string; // "MM:SS"
  end: string;   // "MM:SS"
  question: string;
}

interface AnalysisResult {
    segment: Segment;
    answer: string;
    error?: string;
}

const parseTimeToSeconds = (timeStr: string): number | undefined => {
    const trimmed = timeStr.trim();
    if (!trimmed) return undefined; // Undefined means not set
    
    if (!/^\d+:\d{2}$/.test(trimmed)) {
        throw new Error(`Invalid time format "${trimmed}". Please use MM:SS.`);
    }

    const parts = trimmed.split(':').map(Number);
    return parts[0] * 60 + parts[1];
};

export const VideoAnalyzerView: React.FC<VideoAnalyzerViewProps> = ({ apiKey }) => {
  const [segments, setSegments] = useState<Segment[]>([
    { id: Date.now(), start: '', end: '', question: '' }
  ]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setAnalysis(null);
      setError(null);
    }
  };

  const handleSegmentChange = (id: number, field: keyof Omit<Segment, 'id'>, value: string) => {
    setSegments(currentSegments =>
        currentSegments.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const addSegment = () => {
      setSegments(currentSegments => [
          ...currentSegments,
          { id: Date.now(), start: '', end: '', question: '' }
      ]);
  };

  const removeSegment = (id: number) => {
      setSegments(currentSegments => currentSegments.filter(s => s.id !== id));
  };

  const isAnySegmentValid = () => {
      return segments.some(s => s.question.trim() !== '');
  };

  const handleAnalyze = async () => {
    if (!videoFile || !isAnySegmentValid()) {
      setError('Please upload a video and provide at least one question for a segment.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    const ai = new GoogleGenAI({ apiKey });

    const validSegments = segments.filter(s => s.question.trim() !== '');
    setStatusMessage(`Analyzing ${validSegments.length} segment(s)... This may take a while.`);

    try {
        const analysisPromises = validSegments.map(async (segment) => {
            const startTime = parseTimeToSeconds(segment.start) ?? 0;
            const endTime = parseTimeToSeconds(segment.end);

            if (endTime !== undefined && startTime >= endTime) {
                throw new Error(`For segment "${segment.question.slice(0,20)}...", start time (${segment.start}) cannot be after or same as end time (${segment.end}).`);
            }

            const frames = await extractFramesFromVideo(videoPreview!, {
                startTime,
                endTime,
                fps: 1,
            });

            if (frames.length === 0) {
                throw new Error(`For segment "${segment.question.slice(0,20)}...", could not extract any frames for this time range.`);
            }

            const imageParts = frames.map(frameData => ({
                inlineData: { data: frameData, mimeType: 'image/jpeg' }
            }));
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: {
                    parts: [
                        { text: segment.question },
                        ...imageParts
                    ]
                },
                config: {
                  thinkingConfig: { thinkingBudget: 32768 }
                },
            });

            return { segment, answer: response.text };
        });

        const results = await Promise.allSettled(analysisPromises);
        
        const finalAnalyses: AnalysisResult[] = results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value as AnalysisResult;
            } else {
                console.error('Analysis failed for segment:', validSegments[index], result.reason);
                return {
                    segment: validSegments[index],
                    answer: '',
                    error: (result.reason as Error).message || 'An unknown error occurred during analysis.'
                };
            }
        });
        
        setAnalysis(finalAnalyses);

    } catch (err: any) {
        console.error('Video analysis error:', err);
        setError(err.message || 'An unexpected error occurred during the analysis setup.');
    } finally {
        setIsLoading(false);
        setStatusMessage('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Video File</label>
          <input type="file" accept="video/*" onChange={handleVideoUpload} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100" />
        </div>

        {videoPreview && (
          <video src={videoPreview} controls className="w-full max-w-lg mx-auto rounded-lg"></video>
        )}
        
        {videoFile && (
          <div className="space-y-4">
              <label className="block text-lg font-semibold text-gray-200">Analysis Segments</label>
              {segments.map((segment) => (
                  <div key={segment.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-3 relative">
                      <div className="flex items-center space-x-4">
                          <div className="flex-1">
                              <label htmlFor={`start-${segment.id}`} className="block text-sm font-medium text-gray-400">Start Time</label>
                              <input
                                  type="text"
                                  id={`start-${segment.id}`}
                                  value={segment.start}
                                  onChange={(e) => handleSegmentChange(segment.id, 'start', e.target.value)}
                                  placeholder="MM:SS"
                                  className="mt-1 w-full bg-gray-700 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500 text-white"
                                  disabled={isLoading}
                              />
                          </div>
                          <div className="flex-1">
                              <label htmlFor={`end-${segment.id}`} className="block text-sm font-medium text-gray-400">End Time</label>
                              <input
                                  type="text"
                                  id={`end-${segment.id}`}
                                  value={segment.end}
                                  onChange={(e) => handleSegmentChange(segment.id, 'end', e.target.value)}
                                  placeholder="MM:SS (optional)"
                                  className="mt-1 w-full bg-gray-700 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500 text-white"
                                  disabled={isLoading}
                              />
                          </div>
                      </div>
                      <div>
                          <label htmlFor={`question-${segment.id}`} className="block text-sm font-medium text-gray-400">Question for this segment</label>
                          <textarea
                              id={`question-${segment.id}`}
                              value={segment.question}
                              onChange={(e) => handleSegmentChange(segment.id, 'question', e.target.value)}
                              placeholder="e.g., What is the main action happening here?"
                              className="mt-1 w-full bg-gray-700 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500 text-white"
                              rows={2}
                              disabled={isLoading}
                          />
                      </div>
                      {segments.length > 1 && (
                          <button
                              onClick={() => removeSegment(segment.id)}
                              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 transition-colors"
                              aria-label="Remove segment"
                              disabled={isLoading}
                          >
                              &times;
                          </button>
                      )}
                  </div>
              ))}
              <button
                  onClick={addSegment}
                  className="w-full text-cyan-400 border-2 border-dashed border-gray-600 hover:border-cyan-400 hover:bg-gray-800/50 rounded-lg p-3 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
              >
                  + Add Another Segment
              </button>
          </div>
        )}

        {isLoading ? (
          <Loader text={statusMessage} />
        ) : (
          analysis && (
            <div className="space-y-4">
                <h3 className="font-semibold text-lg text-cyan-300">Analysis Results:</h3>
                {analysis.map((result, index) => (
                    <div key={index} className="bg-gray-800 p-4 rounded-lg">
                        <div className="border-b border-gray-600 pb-2 mb-2">
                            <p className="text-sm text-gray-400">
                                Segment: <span className="font-mono">{result.segment.start || 'Start'} - {result.segment.end || 'End'}</span>
                            </p>
                            <p className="text-sm text-gray-300 font-medium">Q: {result.segment.question}</p>
                        </div>
                        {result.error ? (
                             <ErrorDisplay message={result.error} />
                        ) : (
                            <p className="text-gray-200 whitespace-pre-wrap">{result.answer}</p>
                        )}
                    </div>
                ))}
            </div>
          )
        )}
        {error && !isLoading && (
          <div className="mt-6">
            <ErrorDisplay message={error} onRetry={handleAnalyze} />
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-700/50">
        <button onClick={handleAnalyze} disabled={isLoading || !videoFile || !isAnySegmentValid()} className="w-full bg-cyan-500 rounded-lg p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
          {isLoading ? 'Analyzing...' : `Analyze ${segments.filter(s=>s.question.trim()).length} Segment(s)`}
        </button>
      </div>
    </div>
  );
};
