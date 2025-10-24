
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader } from '../../common/Loader';
import { extractFramesFromVideo } from '../../../utils/video';

export const VideoAnalyzerView: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
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

  const handleAnalyze = async () => {
    if (!videoFile || !question) {
      setError('Please upload a video and ask a question.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      setStatusMessage('Extracting frames from video... (this happens in your browser)');
      const frames = await extractFramesFromVideo(videoPreview!, 1); // 1 frame per second
      if (frames.length === 0) throw new Error("Could not extract frames from video.");

      setStatusMessage(`Analyzing ${frames.length} frames with your question...`);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const imageParts = frames.map(frameData => ({
        inlineData: { data: frameData, mimeType: 'image/jpeg' }
      }));
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: {
          parts: [
            { text: question },
            ...imageParts
          ],
        },
        config: {
          thinkingConfig: { thinkingBudget: 32768 }
        },
      });

      setAnalysis(response.text);

    } catch (err: any) {
      console.error('Video analysis error:', err);
      setError(err.message || 'Failed to analyze video.');
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

        {isLoading ? (
          <Loader text={statusMessage} />
        ) : (
          analysis && (
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-semibold text-lg mb-2 text-cyan-300">Analysis Result:</h3>
              <p className="text-gray-200 whitespace-pre-wrap">{analysis}</p>
            </div>
          )
        )}
        {error && <p className="text-red-400 text-center mt-4">{error}</p>}
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-700/50 space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the video..."
          className="w-full bg-gray-800 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          rows={2}
          disabled={isLoading}
        />
        <button onClick={handleAnalyze} disabled={isLoading || !videoFile || !question} className="w-full bg-cyan-500 rounded-lg p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
          {isLoading ? 'Analyzing...' : 'Analyze Video'}
        </button>
      </div>
    </div>
  );
};